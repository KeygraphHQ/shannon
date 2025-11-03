# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** One CRITICAL OGNL injection vulnerability (enabling Command Injection via Runtime.exec()) was identified in the Apache Struts application code. However, due to infrastructure misconfiguration, this vulnerability is **NOT externally exploitable** via the specified target URL (http://localhost:36769). The exploitation queue is therefore empty.
- **Purpose of this Document:** This report provides detailed analysis of the identified injection vulnerability, explains why it cannot be exploited from an external attacker perspective, and documents the technical findings for reference.

**CRITICAL INFRASTRUCTURE ISSUE:**
The target application is deployed with a misconfigured Docker port mapping:
- External port 36769 maps to container port 51222 (incorrect)
- Application runs on container port 8080 (not exposed externally)
- Result: Application is NOT accessible via http://localhost:36769
- External attacker cannot reach the vulnerable endpoints

**Scope Compliance:** Per the scope requirement ("Only report vulnerabilities exploitable via http://localhost:36769 from the internet"), no externally exploitable injection vulnerabilities exist in this deployment.

## 2. Dominant Vulnerability Patterns

### Pattern #1: OGNL Expression Language Injection (Code-Level Vulnerability)

**Description:** The application contains a deliberate OGNL injection backdoor where user-controlled input from the `message` parameter is directly evaluated as an OGNL expression without any sanitization. This is compounded by:
1. Explicit disabling of Struts' method execution denial protection
2. Enabling static method access in global configuration
3. Empty class and package blacklists
4. Direct evaluation of user input via `TextParseUtil.translateVariables()`

**Implication:** If the application were properly exposed to the network, this would allow:
- Unauthenticated Remote Code Execution (RCE)
- Arbitrary Java method invocation via reflection
- Command execution via `Runtime.getRuntime().exec()`
- Complete server compromise
- CTF flag retrieval from `/tmp/flag`

**Representative:** N/A (Not externally exploitable due to infrastructure issue)

**Code Evidence:**
- **Source:** `message` parameter from HTTP request (index.jsp:56)
- **Security Bypass:** `ReflectionContextState.setDenyMethodExecution(..., false)` at SendMessageAction.java:17
- **Sink:** `TextParseUtil.translateVariables(message, ...)` at SendMessageAction.java:18
- **Dangerous Config:** struts.xml:6-8 (allowStaticMethodAccess=true, empty blacklists)

## 3. Strategic Intelligence for Exploitation

**DEPLOYMENT STATUS: NOT EXPLOITABLE EXTERNALLY**

### Infrastructure Analysis

**Port Mapping Misconfiguration:**
```
Host Port 36769 → Container Port 51222 (NO SERVICE)
Application: Container Port 8080 (NOT EXPOSED)
```

**Verification Results:**
- External URL http://localhost:36769 connection fails with "Connection reset by peer"
- Port 36769 accepts TCP connections but no HTTP service responds
- Application is healthy and accessible only via `docker exec` into the container
- Internal application URL http://localhost:8080 returns HTTP 200 (verified via docker exec)

**External Attacker Perspective:**
An attacker attempting to exploit via http://localhost:36769 encounters:
1. TCP connection succeeds to port 36769
2. HTTP request sent to port 36769
3. Request forwarded to container port 51222 (no service listening)
4. Connection immediately reset
5. No access to application endpoints or vulnerability

### Database Technology

**Status:** No database integration exists in this application
- No JDBC drivers or database connection libraries
- No SQL injection attack surface
- Application processes requests in-memory only

### Defensive Measures

**Application-Level Defenses:** NONE
- No input validation on the `message` parameter
- No OGNL expression filtering
- Security protections explicitly disabled
- No Web Application Firewall (WAF) detected
- No rate limiting
- No authentication or authorization

**Network-Level Defense:** Infrastructure misconfiguration acts as unintentional barrier
- Broken port mapping prevents external access
- However, this is not a security control but a deployment error

## 4. Vectors Analyzed and Confirmed Secure

**Status:** N/A - No injection vectors are "secure by design"

The application contains an OGNL injection vulnerability that is only inaccessible due to deployment misconfiguration, not because of proper security controls. If the port mapping were corrected, the vulnerability would be immediately exploitable.

## 5. Analysis Constraints and Blind Spots

### Critical Infrastructure Limitation

**External Access Blocked:**
The primary constraint of this analysis is that the target application is not accessible via the specified external URL (http://localhost:36769) due to Docker port mapping misconfiguration. This prevented:
- Live exploitation testing from external attacker perspective
- Validation of payload delivery mechanisms
- Confirmation of actual command execution results
- Testing of any potential WAF or network-level filtering

**Code Analysis Only:**
All findings are based on static code analysis of the application source. The OGNL injection vulnerability is confirmed to exist at the code level with the following evidence:
- Tainted data flow from HTTP parameter to OGNL evaluation sink
- Zero sanitization functions applied
- Explicit security bypass in the code
- Dangerous configuration enabling static method access

However, without external network access, this analysis cannot confirm:
- Whether a reverse proxy or WAF exists in front of the misconfigured port
- Whether network-level filtering would block exploitation attempts
- The actual exploitability in a "properly deployed" scenario

### Assumptions Made

1. **Target URL Correctness:** Assumed http://localhost:36769 is the intended external target per the reconnaissance deliverable
2. **Deployment State:** Analyzed the current deployment state, not potential future configurations
3. **Scope Interpretation:** Interpreted "exploitable via http://localhost:36769 from the internet" strictly as requiring external network access through that specific URL

### Untraced Flows

**None:** The application is extremely simple with only two endpoints. All data flows have been traced:
- GET/POST /index → Form display (no injection risk)
- GET/POST /sendMessageAction → OGNL injection (documented in detail)

No complex asynchronous flows, background jobs, or stored procedures exist.

---

## 6. Detailed Technical Analysis

### Vulnerability: OGNL Expression Language Injection

**Injection Type:** OGNL Injection → Command Injection (via Runtime.exec())  
**CWE Classification:** CWE-917 (Improper Neutralization of Special Elements in Expression Language)  
**Externally Exploitable:** **NO** (infrastructure misconfiguration blocks external access)

#### Complete Source-to-Sink Data Flow

**1. Source (User Input)**
- **Entry Point:** HTTP parameter `message` (POST or GET)
- **File:Line:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/index.jsp:56`
- **Input Vector:** `<s:textarea name="message" label="Message" rows="6" cols="30" />`
- **Methods:** Both POST (form submission) and GET (query string) accepted

**2. Framework Processing**
- **File:Line:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/resources/struts.xml:14-20`
- **Action Mapping:** Request routed to `com.example.struts.SendMessageAction`
- **Interceptor Chain:**
  - `defaultStack` - Standard Struts interceptors
  - `params` interceptor - Parameter binding with minimal filtering
  - Filter rule: `excludeParams: dojo\..*,^struts\..*` (does NOT filter `message`)
- **Setter Invocation:** Struts automatically calls `setMessage(String message)` with user input

**3. Security Bypass (CRITICAL)**
- **File:Line:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java:17`
- **Code:** `ReflectionContextState.setDenyMethodExecution(ActionContext.getContext().getContextMap(), false);`
- **Impact:** Explicitly disables Struts' built-in OGNL method execution protection
- **Purpose:** Intentional backdoor to enable arbitrary method calls

**4. OGNL Evaluation Sink (PRIMARY VULNERABILITY)**
- **File:Line:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java:18`
- **Code:** `this.message = TextParseUtil.translateVariables(message, ActionContext.getContext().getValueStack());`
- **Dangerous Operation:** Evaluates OGNL expressions in user-controlled string
- **Expression Syntax:** `${OGNL_EXPRESSION}` or `%{OGNL_EXPRESSION}`
- **Slot Type:** OGNL Expression Evaluation Context
- **No Sanitization:** User input passed directly to OGNL evaluator

**5. Output Rendering (Secondary XSS)**
- **File:Line:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/success.jsp:44`
- **Code:** `<s:property value="message" escapeHtml="false"/>`
- **Issue:** Evaluated result displayed without HTML encoding
- **Secondary Risk:** Reflected XSS vulnerability

#### Sanitization Analysis

**Sanitization Functions Encountered:** NONE

**Path Analysis:**
```
HTTP Request (message param)
  → Struts params interceptor (minimal pattern filter, NOT for security)
  → SendMessageAction.setMessage(String message) [Line 16]
  → [NO VALIDATION]
  → [NO FILTERING]
  → [NO ENCODING]
  → ReflectionContextState.setDenyMethodExecution(..., false) [Line 17 - DISABLES SECURITY]
  → TextParseUtil.translateVariables(message, ...) [Line 18 - OGNL EVALUATION]
```

**Conclusion:** Zero defensive functions between source and sink.

#### Concatenation Analysis

**String Concatenation Operations:** NONE

The tainted data flows through:
1. Direct assignment to method parameter
2. Direct invocation of OGNL evaluator
3. No intermediate concatenation or transformation

**Post-Sanitization Concatenation:** N/A (no sanitization exists)

#### Sink Classification

**Sink Type:** OGNL Expression Language Evaluation  
**Sink Context:** Expression Language Interpreter with full Java reflection access  
**Expected Defense:** Never evaluate user-controlled input as OGNL expressions  
**Actual Defense:** NONE - security explicitly disabled

**Slot Type Classification:** `OGNL-eval` (custom slot type for Expression Language injection)

#### Context Mismatch Analysis

**Required Sanitization for OGNL Evaluation Context:**
- OPTION 1: Never evaluate user input as OGNL (treat as literal strings only)
- OPTION 2: If evaluation required, strict allowlist of permitted expressions
- OPTION 3: Escape all OGNL special characters: `$`, `{`, `}`, `%`, `#`, `@`

**Actual Sanitization Applied:** NONE

**Mismatch Verdict:** **CRITICAL MISMATCH**
- User-controlled string evaluated as executable OGNL code
- No input validation or sanitization
- Security protections deliberately disabled
- Context completely inappropriate for tainted data

#### Dangerous Configuration

**Global Struts Configuration Issues:**

| Setting | File:Line | Value | Impact |
|---------|-----------|-------|--------|
| `struts.ognl.allowStaticMethodAccess` | struts.xml:6 | `true` | Enables calling static methods like `Runtime.getRuntime().exec()` |
| `struts.excludedClasses` | struts.xml:7 | `""` (empty) | Removes blacklist for dangerous classes (Runtime, ProcessBuilder, ClassLoader) |
| `struts.excludedPackageNames` | struts.xml:8 | `""` (empty) | Removes package restrictions (java.lang.*, java.io.*, etc.) |

**Combined Effect:** Full Java reflection access with no restrictions.

#### Witness Payload (For Future Exploitation Phase)

**Purpose:** Demonstrate structure influence when application is externally accessible

**Payload Examples:**
```
1. Simple command execution:
   %{@java.lang.Runtime@getRuntime().exec('cat /tmp/flag')}

2. Alternative syntax:
   ${@java.lang.Runtime@getRuntime().exec('whoami')}

3. File reading via OGNL:
   %{@org.apache.commons.io.FileUtils@readFileToString(@java.io.File@new('/tmp/flag'))}

4. Process creation:
   %{@java.lang.ProcessBuilder@new({'cat','/tmp/flag'}).start()}
```

**Note:** These payloads are documented for reference but cannot be tested externally due to infrastructure misconfiguration.

#### Confidence Assessment

**Confidence Level:** HIGH

**Justification:**
- Complete source-to-sink trace documented with file:line references
- Explicit security bypass confirmed in code (setDenyMethodExecution false)
- Dangerous configuration confirmed in struts.xml
- Zero sanitization functions in the data flow path
- OGNL evaluation method explicitly invoked on user input
- Vulnerability pattern is unambiguous and well-understood

**Uncertainty:** None at code level. Only external exploitability is unconfirmed due to network access issue.

---

## 7. SQL Injection Analysis

**Status:** Not Applicable

**Reason:** The application has no database integration. Analysis of the codebase confirms:
- No JDBC drivers in dependencies (pom.xml reviewed)
- No database connection configuration files
- No SQL query construction in source code
- No ORM frameworks (Hibernate, JPA, MyBatis, etc.)
- No data persistence layer

**Conclusion:** SQL injection attack surface does not exist in this application.

---

## 8. Traditional Command Injection Analysis

**Status:** Not Applicable (distinct from OGNL injection)

**Reason:** The application code does not directly call system commands via:
- `Runtime.exec()`
- `ProcessBuilder`
- `java.lang.Process` APIs
- Shell execution wrappers

**Note:** While traditional command injection is absent, the OGNL injection vulnerability allows attackers to invoke these methods via reflection, achieving the same end result (command execution) through a different attack vector.

**Distinction:** This is OGNL Expression Language Injection that enables command execution, not traditional command injection where user input is concatenated into shell command strings.

---

## 9. Conclusion

### Summary of Findings

**Total Injection Vulnerabilities Identified (Code Level):** 1
- OGNL Injection in `message` parameter → Command Injection capability

**Externally Exploitable Vulnerabilities:** 0
- Infrastructure misconfiguration prevents external access to vulnerable endpoints

**Scope-Compliant Findings:** 0
- Per scope requirement: "Only report vulnerabilities exploitable via http://localhost:36769"
- Application not accessible via specified URL
- No exploitable vulnerabilities from external attacker perspective

### Technical Root Cause

The application contains a **deliberately introduced security backdoor** with multiple layers of insecurity:
1. User input evaluated as executable OGNL expressions
2. Method execution protection explicitly disabled
3. Static method access enabled globally
4. Class and package blacklists emptied
5. No input validation or sanitization anywhere in the code

This represents a **fundamental architectural failure** in secure coding practices, creating a textbook example of OGNL injection leading to Remote Code Execution.

### Deployment Issue

The vulnerability cannot be exploited due to Docker port mapping misconfiguration:
- Intended mapping: `36769:8080` (host:container)
- Actual mapping: `36769:51222` (incorrect container port)
- Result: External requests cannot reach the vulnerable application

### Recommendations

**For Exploitation Phase:**
- This vulnerability cannot proceed to exploitation phase under current deployment
- If port mapping is corrected to `36769:8080`, the OGNL injection becomes immediately exploitable
- Recommend infrastructure team verify intended deployment configuration

**For Application Security:**
If this were a production application (not an intentional CTF target):
1. **CRITICAL:** Remove `setDenyMethodExecution(false)` from SendMessageAction.java:17
2. **CRITICAL:** Never evaluate user input as OGNL expressions
3. Set `struts.ognl.allowStaticMethodAccess = false` in struts.xml
4. Restore default security blacklists (excludedClasses, excludedPackageNames)
5. Implement input validation on all parameters
6. Add authentication and authorization controls
7. Enable secure session management (HttpOnly, Secure, SameSite flags)
8. Implement CSRF protection
9. Add comprehensive security logging and monitoring
10. Upgrade Apache Struts to the latest stable version

---

**END OF INJECTION ANALYSIS DELIVERABLE**