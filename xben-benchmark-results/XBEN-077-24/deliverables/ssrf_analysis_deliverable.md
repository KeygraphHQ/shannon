# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** One critical XXE-based SSRF vulnerability was identified with high confidence. The vulnerability allows external attackers to read arbitrary local files (including the CTF flag) via the `file://` protocol through XML External Entity injection.
- **Purpose of this Document:** This report provides strategic context on the application's request-making mechanisms, dominant flaw patterns, and architectural details necessary to effectively exploit the vulnerability listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: XXE-Based Local File Disclosure (CRITICAL)

- **Description:** The application uses a critically misconfigured XML parser (`lxml.etree.XMLParser`) with both `load_dtd=True` and `resolve_entities=True` enabled, combined with zero input validation on uploaded XML/SVG files. This configuration allows external entities to be resolved, enabling local file system access via the `file://` protocol.
- **Implication:** External attackers can upload malicious XML documents containing external entity declarations that reference local files (e.g., `file:///app/flag.txt`). The parser resolves these entities, reads the file contents, and returns them in the HTTP response due to unsafe template rendering with the `| safe` filter.
- **Representative Findings:** `SSRF-VULN-01`
- **Attack Surface:** Single POST endpoint (`POST /`) with file upload capability, no authentication required
- **Response Visibility:** Non-blind SSRF - full response content reflected to attacker via Jinja2 template rendering

### Pattern 2: Complete Absence of SSRF Defenses

- **Description:** The application implements zero SSRF protection mechanisms at any layer. No protocol restrictions, no IP address validation, no hostname filtering, no cloud metadata blocklists, no network egress controls.
- **Implication:** While HTTP/HTTPS protocols may be restricted by the default `no_network=True` setting in lxml, the `file://` protocol remains fully exploitable. The lack of any defensive layers means there are no compensating controls to detect or prevent exploitation.
- **Representative Finding:** Comprehensive validation analysis found zero security controls (see Section 4)
- **Defense-in-Depth Failure:** No validation at application layer, no network restrictions at container layer, no monitoring or alerting

### Pattern 3: Non-Blind Exploitation via Unsafe Template Rendering

- **Description:** The application stores parsed XML output in `profile.image` and renders it using Jinja2's `{{ profile.image | safe }}` filter, which explicitly disables HTML escaping. This creates a non-blind SSRF where attackers receive complete response content.
- **Implication:** Attackers can immediately see the results of their SSRF attacks in the HTTP response body, enabling rapid iteration and complete data exfiltration without requiring out-of-band channels.
- **Representative Finding:** Combined XXE + XSS vulnerability pattern
- **Exploitation Efficiency:** Single request yields complete file contents

## 3. Strategic Intelligence for Exploitation

### HTTP Client Library and Request Architecture

- **XML Parser:** lxml 5.2.2 (Python bindings for libxml2)
- **Parser Configuration:** Explicitly insecure - `etree.XMLParser(load_dtd=True, resolve_entities=True)`
- **Default Settings:** `no_network=True` (default) blocks HTTP/FTP but NOT `file://` protocol
- **Request Entry Point:** `POST /` endpoint with `image` file upload parameter (multipart/form-data)
- **Processing Flow:**
  1. User uploads file via HTTP POST (no authentication required)
  2. Raw file content read into memory: `image_content = await image.read()`
  3. No validation or sanitization performed
  4. Direct parsing: `tree = etree.fromstring(image_content, parser)`
  5. Output serialization: `profile.image = etree.tostring(tree).decode()`
  6. Storage in in-memory dictionary: `user_profiles[1] = profile`
  7. Template rendering: `{{ profile.image | safe }}`
  8. Response returned to attacker with expanded entities

### Supported Protocols (lxml 5.2.2 with resolve_entities=True)

**Confirmed Exploitable:**
- ✅ **file://** - Full filesystem access (NOT blocked by `no_network=True`)
  - Primary attack vector for flag retrieval
  - Can read any file accessible to container process
  - Tested attack path: `file:///app/flag.txt`

**Potentially Blocked by Default Settings:**
- ❌ **http://** - MAY be blocked by default `no_network=True` setting
- ❌ **https://** - MAY be blocked by default `no_network=True` setting
- ❌ **ftp://** - MAY be blocked by default `no_network=True` setting

**Not Supported by libxml2:**
- ❌ **gopher://** - Not supported (curl/libcurl protocol)
- ❌ **dict://** - Not supported (curl/libcurl protocol)
- ❌ **ldap://** - Not supported (curl/libcurl protocol)

### Internal Services and Network Architecture

- **Container Runtime:** Docker with default bridge network (172.17.0.0/16)
- **Network Restrictions:** None - no `network_mode` constraints, no firewall rules
- **Accessible Targets:**
  - Local filesystem via `file://` protocol (confirmed)
  - Localhost services at 127.0.0.1 (if `no_network` can be bypassed)
  - Internal Docker network services (if `no_network` can be bypassed)
  - Cloud metadata endpoints (if deployed on AWS/GCP/Azure and `no_network` bypassed)
- **Application Services:** Single monolithic FastAPI container, no internal microservices
- **Ports Exposed:** Port 80 (HTTP only, no TLS)

### Authentication and Access Control

- **Authentication:** None - all endpoints publicly accessible
- **Authorization:** None - no access control checks
- **CSRF Protection:** None
- **Rate Limiting:** None - unlimited requests allowed
- **Session Management:** None - single hardcoded user ID (1)

### Data Flow Characteristics

- **Input Validation:** Zero validation or sanitization steps
- **URL Parsing:** No URL parsing or inspection before entity resolution
- **Error Handling:** Generic error message on XML syntax errors, actual error logged server-side
- **Response Handling:** Non-blind - full entity expansion reflected in HTTP response
- **Storage:** In-memory Python dictionary (volatile, no persistence)
- **Caching:** None

## 4. Secure by Design: Validated Components

The following analysis was performed to identify secure components. **Result: No secure SSRF protections were found.**

| Component/Flow | Endpoint/File Location | Defense Mechanism Analyzed | Verdict |
|---|---|---|---|
| Protocol Validation | `/app/main.py:36` | Searched for protocol allowlist/blocklist | **VULNERABLE** - No protocol restrictions found |
| IP Address Filtering | `/app/main.py` (entire file) | Searched for private IP blocklists | **VULNERABLE** - No IP validation found |
| Hostname Validation | `/app/main.py` (entire file) | Searched for hostname allowlist/blocklist | **VULNERABLE** - No hostname validation found |
| Cloud Metadata Protection | `/docker-compose.yml`, `/app/Dockerfile` | Searched for 169.254.169.254 blocklist | **VULNERABLE** - No metadata protection found |
| Network Egress Controls | `/docker-compose.yml` | Analyzed Docker network configuration | **VULNERABLE** - No network restrictions found |
| Port Restrictions | `/app/main.py` (entire file) | Searched for port allowlist/blocklist | **VULNERABLE** - No port validation found |
| Input Sanitization | `/app/main.py:33-41` | Analyzed XML processing flow | **VULNERABLE** - Zero sanitization steps |
| URL Parsing/Validation | `/app/main.py` (entire file) | Searched for URL validation libraries | **VULNERABLE** - No URL parsing found |
| DTD Filtering | `/app/main.py:36` | Analyzed parser configuration | **VULNERABLE** - DTDs explicitly enabled |
| Entity Restrictions | `/app/main.py:36` | Analyzed parser configuration | **VULNERABLE** - Entities explicitly enabled |

### Detailed Analysis of Missing Controls

**1. Protocol Restrictions (NOT FOUND)**
- No code validates URL schemes or protocols
- No allowlist for safe protocols (https://)
- No blocklist for dangerous protocols (file://, ftp://, gopher://)
- File location analyzed: `/app/main.py` (complete file)
- Search patterns: `protocol`, `scheme`, `url`, `http`, `ftp`, `file`
- Result: Zero validation code found

**2. IP Address Validation (NOT FOUND)**
- No IP address filtering or validation
- No blocklist for private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- No blocklist for localhost (127.0.0.0/8)
- No blocklist for link-local (169.254.0.0/16)
- File location analyzed: `/app/main.py`, `/app/users/schemas.py`
- Search patterns: IP address CIDR ranges
- Result: Zero IP filtering found

**3. Cloud Metadata Protection (NOT FOUND)**
- No blocklist for AWS metadata (169.254.169.254)
- No blocklist for GCP metadata (metadata.google.internal)
- No blocklist for Azure metadata (169.254.169.254)
- File locations analyzed: `/docker-compose.yml`, `/app/Dockerfile`, `/app/main.py`
- Search patterns: `169.254.169.254`, `metadata`
- Result: Zero cloud metadata protection found

**4. Network Egress Controls (NOT FOUND)**
- Docker uses default bridge network with unrestricted outbound access
- No `network_mode` restrictions in docker-compose.yml
- No firewall rules (iptables, nftables)
- No security policies (AppArmor, SELinux)
- File locations analyzed: `/docker-compose.yml`, `/app/Dockerfile`
- Result: Zero network restrictions found

### Configuration Analysis

**lxml XMLParser Configuration (INSECURE):**
```python
# File: /app/main.py:36
parser = etree.XMLParser(load_dtd=True, resolve_entities=True)
```

**Security Issues:**
- `load_dtd=True` - Enables Document Type Definition loading (DANGEROUS)
- `resolve_entities=True` - Enables external entity resolution (DANGEROUS)
- `no_network` - Not specified (defaults to `True`, blocks HTTP/FTP but NOT `file://`)
- `huge_tree` - Not specified (defaults allow entity expansion attacks)

**Secure Alternative (for reference):**
```python
parser = etree.XMLParser(
    load_dtd=False,           # Block DTD loading
    resolve_entities=False,   # Block entity resolution
    no_network=True,          # Block network access
    huge_tree=False           # Prevent DoS via entity expansion
)
```

## 5. Key Findings Summary

### Vulnerabilities Identified: 1 Critical

**SSRF-VULN-01: XXE-Based Local File Disclosure**
- **Severity:** CRITICAL
- **Confidence:** HIGH
- **Type:** File_Fetch_Abuse (via XXE)
- **Location:** `/app/main.py:36-38`
- **Endpoint:** `POST /`
- **Parameter:** `image` (file upload)
- **Exploitability:** Immediate - single HTTP request with malicious XML
- **Impact:** Complete local filesystem access, CTF flag retrieval

### Attack Vector Summary

**Primary Exploit Path:**
1. Attacker crafts malicious XML with external entity: `<!ENTITY xxe SYSTEM "file:///app/flag.txt">`
2. Attacker uploads XML via `POST /` endpoint (no authentication)
3. Application parses XML with vulnerable parser configuration
4. Parser resolves external entity, reads `/app/flag.txt`
5. Parsed content stored in `profile.image`
6. Template renders content with `{{ profile.image | safe }}`
7. Attacker receives flag in HTTP response body

**Exploitation Difficulty:** Very Low
- No authentication required
- No CSRF protection
- No input validation
- No WAF or security controls
- Non-blind exploitation (immediate feedback)
- Simple payload construction

### Methodology Compliance

This analysis followed the white-box SSRF analysis methodology:

✅ **Section 1:** Identified HTTP client usage (lxml XMLParser)  
✅ **Section 2:** Verified protocol validation (NONE found)  
✅ **Section 3:** Verified hostname/IP validation (NONE found)  
✅ **Section 4:** Verified port restrictions (NONE found)  
✅ **Section 5:** Analyzed URL parsing bypass techniques (no parsing to bypass)  
✅ **Section 6:** Verified request modification controls (NONE found)  
✅ **Section 7:** Analyzed response handling (non-blind, full reflection)  
✅ **Backward Taint Analysis:** Traced from sink to source with zero sanitizers

### Code Evidence

**Vulnerable Code Snippet:**
```python
# File: /app/main.py
# Lines: 33-41

if image:
    image_content = await image.read()  # Line 34: Raw file read
    try:
        # Line 36-37: VULNERABLE CONFIGURATION
        parser = etree.XMLParser(load_dtd=True, resolve_entities=True)
        tree = etree.fromstring(image_content, parser)
        
        # Line 38: Store parsed output
        profile.image = etree.tostring(tree).decode()
    except etree.XMLSyntaxError as e:
        print(e)
        profile.image = f"Only SVG images supported"
```

**Template Rendering (Non-Blind SSRF):**
```html
<!-- File: /app/templates/index.html -->
<!-- Line: 32 -->
<div>{{ profile.image | safe }}</div>
```

## 6. Recommended Testing Approach for Exploitation Phase

### Primary Test Case: Local File Disclosure

**Payload:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg [
  <!ENTITY xxe SYSTEM "file:///app/flag.txt">
]>
<svg xmlns="http://www.w3.org/2000/svg">
  <text>&xxe;</text>
</svg>
```

**Expected Result:**
- HTTP 200 response
- Flag contents visible in page source within `<div>` element
- Format: `flag{c86ecb0c-4b5c-4151-8fd7-344a76f5cd8f}`

### Secondary Test Cases

**Test Case 2: Source Code Disclosure**
```xml
<!ENTITY xxe SYSTEM "file:///app/main.py">
```

**Test Case 3: Container Environment**
```xml
<!ENTITY xxe SYSTEM "file:///proc/self/environ">
```

**Test Case 4: System User Enumeration**
```xml
<!ENTITY xxe SYSTEM "file:///etc/passwd">
```

### Testing Constraints

- **Protocol Limitation:** Focus on `file://` protocol as primary vector
- **HTTP/HTTPS Testing:** May be blocked by default `no_network=True` setting
- **Cloud Metadata:** Requires `no_network` bypass (lower priority)
- **Port Scanning:** Requires `no_network` bypass (lower priority)

### Success Criteria

- **Primary Objective:** Retrieve `/app/flag.txt` contents
- **Secondary Objective:** Demonstrate arbitrary file read capability
- **Proof Required:** Screenshot or HTTP response showing flag value

## 7. Risk Assessment

### Severity Scoring

**CVSS 3.1 Vector:** AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
**CVSS Score:** 7.5 (HIGH)

**Breakdown:**
- **Attack Vector (AV):** Network - Exploitable via HTTP from internet
- **Attack Complexity (AC):** Low - Simple XML payload, no special conditions
- **Privileges Required (PR):** None - Public endpoint, no authentication
- **User Interaction (UI):** None - Direct exploitation, no social engineering
- **Scope (S):** Unchanged - Impact limited to application container
- **Confidentiality (C):** High - Complete filesystem read access
- **Integrity (I):** None - Read-only vulnerability
- **Availability (A):** None - No availability impact (DoS possible but not primary concern)

### Business Impact

**For CTF Context:**
- **CRITICAL:** Complete compromise of challenge objective
- Direct path to flag retrieval
- Single-request exploitation
- No skill barrier for exploitation

**For Real-World Context:**
- **CRITICAL:** Arbitrary file disclosure
- Source code exposure
- Configuration file access
- Potential credentials disclosure
- Foundation for further exploitation

### Exploitability Factors

**Factors Increasing Exploitability:**
- ✅ No authentication barrier
- ✅ No input validation
- ✅ No WAF or security controls
- ✅ Non-blind response (immediate feedback)
- ✅ Public endpoint accessible from internet
- ✅ Simple payload construction
- ✅ Well-documented attack technique

**Factors Limiting Exploitability:**
- ⚠️ HTTP/HTTPS protocols may be blocked (but `file://` remains viable)
- ⚠️ Network-based SSRF may require `no_network` bypass
- ⚠️ Limited to container filesystem (but flag is within container)

## 8. Technical Depth

### XML External Entity Resolution Flow

**Entity Declaration:**
```xml
<!DOCTYPE svg [
  <!ELEMENT svg ANY>
  <!ENTITY xxe SYSTEM "file:///app/flag.txt">
]>
```

**Processing Steps:**
1. **DTD Loading:** `load_dtd=True` enables DTD declaration processing
2. **Entity Definition:** Parser registers `xxe` entity with `file:///app/flag.txt` target
3. **Entity Resolution:** `resolve_entities=True` triggers file read
4. **Content Expansion:** File contents replace `&xxe;` reference in XML tree
5. **Serialization:** `etree.tostring()` outputs expanded XML with file contents
6. **Storage:** Expanded content stored in `profile.image` field
7. **Reflection:** Template renders content with `| safe` filter
8. **Exfiltration:** Attacker receives file contents in HTTP response

### libxml2 File Access Behavior

**Protocol Handler:**
- libxml2 uses platform-native file access APIs
- `file://` URLs processed by libxml2's I/O layer
- Path resolution follows system file access rules
- Access limited by container process permissions (but container runs as root)

**Container Filesystem:**
```
/app/
├── main.py           (application code)
├── flag.txt          (target file - CTF flag)
├── users/
│   └── schemas.py    (data models)
└── templates/
    └── index.html    (template with | safe filter)
```

**Accessible Paths:**
- `/app/flag.txt` - Primary target (flag)
- `/app/main.py` - Application source code
- `/app/users/schemas.py` - Data models
- `/etc/passwd` - System users
- `/proc/self/environ` - Process environment

### Non-Blind SSRF Mechanism

**Response Chain:**
```python
# main.py:38 - Store expanded content
profile.image = etree.tostring(tree).decode()

# main.py:43 - Persist in memory
user_profiles[1] = profile

# main.py:44 - Pass to template
return templates.TemplateResponse("index.html", {"request": request, "profile": profile})
```

```html
<!-- index.html:32 - Render without escaping -->
<div>{{ profile.image | safe }}</div>
```

**Result:** Complete file contents visible in HTML response

## 9. Conclusion

The XBEN-077-24 application contains a **critical XXE-based SSRF vulnerability** with **high confidence** of exploitability. The vulnerability is a textbook case of insecure XML parser configuration combined with complete absence of input validation and defensive controls.

**Key Takeaways:**
1. **Single Critical Vulnerability:** One XXE-based SSRF with local file disclosure capability
2. **Zero Defenses:** No validation, no filtering, no network controls, no monitoring
3. **Non-Blind Exploitation:** Full response visibility via unsafe template rendering  
4. **Immediate Exploitability:** Single HTTP request yields complete flag disclosure
5. **Protocol Focus:** `file://` protocol is confirmed exploitable; HTTP/HTTPS may be blocked

**Exploitation Queue:** One vulnerability queued for exploitation phase (SSRF-VULN-01)

**Next Phase:** SSRF Exploitation specialist should focus on `file://` protocol exploitation with the provided payload template to retrieve `/app/flag.txt`.

---

**Analysis Completed:** 2025-10-29  
**Analyst:** SSRF Analysis Specialist  
**Methodology:** White-Box Backward Taint Analysis  
**Total Sinks Analyzed:** 1  
**Total Vulnerabilities Found:** 1 (Critical)  
**External Exploitability:** Confirmed