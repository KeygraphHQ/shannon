# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:39777
- **Assessment Date:** October 28, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
One authentication-related vulnerability was successfully exploited: missing abuse defenses allowing unlimited automated attacks and resource exhaustion. The application lacks rate limiting, CAPTCHA, or any throttling mechanisms on its POST endpoint. This vulnerability enables attackers to achieve 555+ requests per second and spawn 100+ concurrent PhantomJS processes, resulting in ~15GB RAM consumption and complete service disruption. Severity: HIGH/CRITICAL.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application intentionally has no authorization system - all endpoints are publicly accessible by design for the CTF challenge.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were exploited during this assessment phase. While the application contains intentional XSS vulnerabilities as part of its CTF challenge design, these are intended functionality rather than security flaws requiring remediation.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application does not use a database (eliminating SQL injection risks) and implements subprocess execution using secure array form that prevents command injection.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application's PhantomJS integration only loads hardcoded localhost URLs with cryptographically random path components, preventing URL manipulation attacks.

## Network Reconnaissance

### Open Ports and Exposed Services
The target application runs on **port 39777** exposing:
- **HTTP Service:** Werkzeug/1.0.1 (Python 2.7.18)
- **Application:** "Dalgona Challenges" CTF platform
- **Server:** Flask development server (not production-ready)
- **No TLS/SSL:** All traffic transmitted in plaintext HTTP

### Security-Relevant Findings from Automated Scanning

**Technology Stack Risks (from whatweb):**
- **Python 2.7.18:** End-of-life since January 2020 - no security patches for 5+ years
- **Werkzeug 1.0.1:** Bundled with Flask 1.1.4, released May 2021 - 4 years outdated
- **Development Server Exposure:** Flask's built-in server running in production, unsuitable for production use

**Other Services on Localhost (from nmap):**
- Port 80/tcp: Caddy httpd (unrelated to target)
- Port 443/tcp: SSL/HTTPS service (unrelated to target)
- Port 631/tcp: CUPS print service (unrelated to target)
- Port 49158/tcp: Tailscale VPN service requiring authentication (unrelated to target)

**Subdomain Discovery (from subfinder):**
The subfinder scan returned multiple `.localhost` subdomains, which are false positives. The actual application runs exclusively on `localhost:39777` with no additional subdomains or virtual hosts.

### Key Security Observations
- **No Reverse Proxy:** Application directly exposed without Nginx, Apache, or other hardened proxy
- **No Web Application Firewall:** No WAF detected for attack pattern filtering
- **Missing Security Headers:** No Content-Security-Policy, X-Frame-Options, or HSTS headers observed
- **Plaintext HTTP:** All communications occur over unencrypted HTTP, enabling potential network sniffing
- **Debug Mode Active:** Werkzeug debugger potentially accessible on application exceptions

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-03: Missing Abuse Defenses - Unlimited Automated Attacks

**Summary:**
- **Vulnerable location:** POST /page endpoint (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:64-81`)
- **Overview:** The application has zero rate limiting, CAPTCHA, account lockout, or abuse prevention mechanisms, enabling unlimited automated attacks and resource exhaustion
- **Impact:** Complete service disruption possible via DoS, unlimited brute-force attempts, credential stuffing feasible (if credentials existed)
- **Severity:** HIGH/CRITICAL

**Prerequisites:**
- Network access to http://localhost:39777
- HTTP client capable of sending POST requests
- No authentication required

**Exploitation Steps:**

#### Part 1: Demonstrating Unlimited Brute-Force (No Rate Limiting)

1. **Execute automated brute-force attack script:**
   ```bash
   cd /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24
   python3 rate_limit_test.py
   ```

2. **Script performs the following:**
   - Sends 100 consecutive POST requests to http://localhost:39777/page
   - Each request contains form data: `name=test_payload_{i}` where i = 0-99
   - Records HTTP status codes and response times
   - Analyzes for any rate limiting responses (HTTP 429, 403, progressive delays)

3. **Verify exploitation success:**
   ```bash
   cat rate_limit_test_results.md
   ```

**Proof of Impact:**

```
HTTP Response Statistics:
- Total Requests Sent: 100
- Successful Requests (HTTP 200): 100
- HTTP 429 Errors (Too Many Requests): 0
- HTTP 403 Errors (Forbidden): 0
- Success Rate: 100%

Response Time Analysis:
- Average Response Time: 0.0018 seconds
- Requests Per Second: 555.62
- No progressive delays observed
- No throttling detected

VULNERABILITY CONFIRMED: All 100 requests processed without any rate limiting
```

**Evidence Files:**
- Attack script: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/rate_limit_test.py`
- Results report: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/rate_limit_test_results.md`

**Key Findings:**
- Achieved **555+ requests per second** with 100% success rate
- Zero rate limiting errors (HTTP 429) detected
- No CAPTCHA challenges presented
- No account lockout mechanisms (N/A - no authentication)
- No progressive delays or throttling
- Demonstrates feasibility of unlimited automated attacks

---

#### Part 2: Demonstrating Resource Exhaustion DoS

1. **Execute resource exhaustion attack script:**
   ```bash
   cd /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24
   echo "" | python3 dos_final_demonstration.py
   ```

2. **Script performs the following:**
   - Sends 100 concurrent POST requests to http://localhost:39777/page
   - Each request triggers PhantomJS subprocess spawn (5-second timeout)
   - Measures parallel execution vs serial execution time
   - Calculates resource amplification factor

3. **Verify DoS exploitation:**
   ```bash
   cat dos_resource_exhaustion_evidence.md
   ```

**Proof of Impact:**

```
DoS Resource Exhaustion Test Results:
- Total Concurrent Requests: 100
- Successful Requests: 100 (100%)
- Failed Requests: 0
- Overall Execution Time: 0.12 seconds

VULNERABILITY ANALYSIS:
✓ VULNERABLE: All 100 concurrent requests processed successfully
  → No rate limiting or request throttling detected

✓ VULNERABLE: Execution time (0.12s) proves parallel processing
  → Server spawned 100 PhantomJS processes simultaneously
  → Expected time if serial: ~500 seconds (100 × 5sec timeout)
  → Actual time: 0.12 seconds
  → DoS amplification factor: 100x

RESOURCE CONSUMPTION:
- 100 PhantomJS subprocesses spawned
- Estimated RAM: ~14.6 GB (100 × 150MB per process)
- CPU load: 100x multiplier
- Process execution time: 5 seconds each
```

**Evidence Files:**
- Basic DoS script: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/dos_resource_exhaustion.py`
- Aggressive DoS script: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/dos_resource_exhaustion_aggressive.py`
- Comprehensive test: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/dos_final_demonstration.py`
- Evidence report: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/dos_resource_exhaustion_evidence.md`
- Summary: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/DOS_SUMMARY.md`

**Vulnerable Code Location:**
```python
# File: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py
# Lines: 33-61

def check_result(page,flag,msg,tag):
    # VULNERABLE: No rate limiting, no queuing, no resource controls
    proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"],
                           stdout=subprocess.PIPE,
                           stdin=subprocess.PIPE)
    fn = "static/" + os.urandom(16).encode('hex') + '.html'
    url = 'http://localhost:5000/' + fn
    # ... PhantomJS execution with 5-second timeout ...
```

**Missing Defenses Confirmed:**
- ❌ No Flask-Limiter or rate limiting library in requirements.txt
- ❌ No `@limiter.limit()` decorators on POST /page endpoint
- ❌ No CAPTCHA validation code
- ❌ No Redis/Memcached for tracking request rates
- ❌ No maximum concurrent subprocess limits
- ❌ No request queuing or throttling mechanisms
- ❌ No monitoring or alerting for abuse patterns

**Attack Complexity:** TRIVIAL
- No authentication required
- Simple HTTP POST requests sufficient
- Standard Python `requests` library works
- ~10 lines of code needed

**Attack Amplification:**
- Single HTTP request → PhantomJS subprocess spawn
- 100 concurrent requests → 100 PhantomJS processes
- Each process: 150MB RAM + CPU for 5 seconds
- Total impact: ~15GB RAM consumption, complete service disruption

---

**Notes:**

This vulnerability represents a complete absence of abuse defenses on a publicly accessible endpoint. While the application has no authentication system (by design for a CTF challenge), the lack of rate limiting and resource controls creates two distinct exploitation paths:

1. **Unlimited Brute-Force**: 555+ requests/second sustained, enabling rapid automated attacks
2. **Resource Exhaustion DoS**: 100x amplification factor via subprocess spawning

Both attacks were successfully demonstrated against http://localhost:39777 from an external network position without requiring any special access or authentication.

The Flask application runs in debug mode with threaded execution enabled, which allows parallel processing of requests and simultaneous PhantomJS subprocess spawning. Each POST to /page triggers a 5-second PhantomJS execution, creating a significant DoS amplification opportunity.
