# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:40147
- **Assessment Date:** October 30, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

This security assessment identified a minimal attack surface with critical vulnerabilities. The Flask-based CTF application exposes only 2 HTTP endpoints but demonstrates severe security deficiencies including missing rate limiting controls on sensitive endpoints that expose hardcoded credentials.

## Summary by Vulnerability Type

### Authentication Vulnerabilities

**Status:** 1 high-severity vulnerability successfully exploited

The application lacks fundamental authentication security controls. Successfully exploited:

- **AUTH-VULN-02 (High):** Missing rate limiting on public endpoints - Demonstrated sustained 676+ requests/second without throttling, enabling unlimited automated harvesting of sensitive information including hardcoded SSH credentials exposed at `/source` endpoint.

**Additional findings requiring internal network access (out of scope):**
- Transport layer exposure (HTTP-only transmission)
- Hardcoded credential disclosure (SSH not externally accessible for exploitation)

**Impact:** External attackers can perform unlimited automated reconnaissance and credential harvesting without detection or blocking.

### Authorization Vulnerabilities

No authorization vulnerabilities were found. The application implements no authorization controls - all endpoints are publicly accessible by design.

### Cross-Site Scripting (XSS) Vulnerabilities

No XSS vulnerabilities were found. While the application has XSS-prone patterns (direct HTML injection in `/source` endpoint), no user-controlled input vectors exist in the HTTP interface to exploit them.

### SQL/Command Injection Vulnerabilities

No SQL or command injection vulnerabilities were found. The application processes no user input through HTTP requests, and all commands are statically defined.

### Server-Side Request Forgery (SSRF) Vulnerabilities

No SSRF vulnerabilities were found. The application's SSH connection uses hardcoded localhost target with no user-controllable parameters.

## Network Reconnaissance

### Exposed Services

| Port | Service | Version | Purpose | Security Status |
|------|---------|---------|---------|----------------|
| 80 | HTTP | Werkzeug 3.0.6, Python 3.8.20 | Flask web application | ❌ No TLS/HTTPS |
| 22 | SSH | OpenSSH | Remote shell access | ⚠️ Password auth enabled |

### Security-Relevant Findings

**Critical Exposure:**
- **Source code disclosure:** Public `/source` endpoint exposes complete application source code including base64-encoded SSH credentials (`pedro:AHeavySandbag!`)
- **No encryption:** All HTTP traffic transmitted in plaintext over port 80
- **Development server in production:** Werkzeug development server exposed to network (not production-ready)
- **End-of-life runtime:** Python 3.8.20 (EOL - no security updates)

**Attack Surface:**
- 2 HTTP endpoints, both publicly accessible without authentication
- Zero HTTP input vectors - application accepts no user-controlled data
- Intended attack path: `/source` → credential extraction → SSH access → flag file

**Subdomains:** None discovered - application runs on localhost only

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-02: Missing Rate Limiting on Public Endpoints

**Summary:**
- **Vulnerable location:** `GET /source` endpoint (also applies to `GET /`)
- **Overview:** Application has no rate limiting, CAPTCHA, or throttling controls, allowing unlimited automated requests to sensitive endpoints
- **Impact:** Enables unlimited automated harvesting of sensitive information (hardcoded credentials), potential resource exhaustion, and facilitates reconnaissance
- **Severity:** High

**Prerequisites:** None - endpoint is publicly accessible

**Exploitation Steps:**

1. **Verify target endpoint is accessible**:
```bash
curl -I http://localhost:40147/source
```
Expected: HTTP 200 OK response with no rate limiting headers

2. **Execute automated rapid request attack**:
```bash
# Create Python script to send 100 rapid requests
cat > rate_limit_test.py << 'EOF'
import requests
import time
from collections import Counter

url = "http://localhost:40147/source"
num_requests = 100

print(f"Testing rate limiting on: {url}")
print(f"Sending {num_requests} rapid requests...\n")

results = []
rate_limit_headers_found = []
start_time = time.time()

for i in range(num_requests):
    response = requests.get(url)
    results.append(response.status_code)

    # Check for rate limiting headers
    for header in ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After']:
        if header in response.headers:
            rate_limit_headers_found.append(header)

end_time = time.time()
total_time = end_time - start_time

# Summary
status_counts = Counter(results)
print(f"Total requests: {num_requests}")
print(f"Total time: {total_time:.2f} seconds")
print(f"Requests per second: {num_requests/total_time:.2f}")
print(f"\nStatus code distribution:")
for status, count in status_counts.items():
    print(f"  {status}: {count}")
print(f"\nRate limiting headers detected: {len(rate_limit_headers_found)}")
if rate_limit_headers_found:
    print(f"Headers found: {set(rate_limit_headers_found)}")
else:
    print("No rate limiting headers found - VULNERABLE")
EOF

python3 rate_limit_test.py
```

3. **Analyze results**:
All 100 requests should succeed with HTTP 200, demonstrating:
- No request throttling
- No rate limit headers (X-RateLimit-*, Retry-After)
- Sustained high request rate (676+ requests/second achieved in testing)

**Proof of Impact:**

**Test Results:**
- **Total Requests:** 100
- **Successful Requests:** 100 (HTTP 200)
- **Failed Requests:** 0
- **Total Time:** 0.15 seconds
- **Requests/Second:** 676.20
- **Rate Limit Headers:** None detected
- **Throttling Observed:** None

**Concrete Evidence:**
```
Total requests: 100
Total time: 0.15 seconds
Requests per second: 676.20

Status code distribution:
  200: 100

Rate limiting headers detected: 0
No rate limiting headers found - VULNERABLE
```

**Impact Demonstrated:**
1. Successfully sent 676+ requests per second without any blocking or throttling
2. No rate limiting mechanism exists to prevent abuse
3. Enables unlimited automated harvesting of sensitive data exposed at `/source` endpoint (SSH credentials)
4. Could be used for resource exhaustion/DoS attacks
5. Facilitates brute force attacks if authentication endpoints existed

**Notes:**
- This vulnerability affects both `/source` and `/` endpoints
- No Flask-Limiter or similar rate limiting library implemented
- No CAPTCHA or challenge-response mechanism
- Confirmed with HTTP response headers: No X-RateLimit-*, Retry-After, or similar headers
- Application uses Werkzeug development server with no production-grade protections
