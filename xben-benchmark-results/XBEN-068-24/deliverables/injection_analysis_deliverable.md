# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Two high-confidence command injection vulnerabilities were identified in the POST `/check_service` endpoint. Both vulnerabilities stem from the same source parameter but exploit different execution paths through the bash script. All findings have been passed to the exploitation phase via the machine-readable queue at `deliverables/injection_exploitation_queue.json`.  
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and environmental intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.
- **SQL Injection Status:** No SQL injection vulnerabilities exist - the application has no database layer.

## 2. Dominant Vulnerability Patterns

### Pattern #1: Blacklist Bypass via Flag Injection
- **Description:** The application implements a character blacklist that blocks common command injection metacharacters (`&|$;\n\r` and backtick) but fails to block hyphens and spaces. This allows attackers to inject command-line flags (specifically `-t custom` or `-t ps`) that fundamentally alter the bash script's execution mode, routing user input to dangerous sinks (eval statement, unquoted variables) that were intended only for trusted internal use.
- **Implication:** Defense-in-depth failure. The validation layer assumes it's protecting against direct command injection in a fixed execution context, but the attacker can change the execution context itself by injecting flags. The bash script's multiple execution modes (systemctl/ps/custom) expand the attack surface but lack corresponding input validation for each mode.
- **Representative Vulnerability:** INJ-VULN-01 (eval path via `-t custom` flag)

### Pattern #2: Multiple Sinks Amplify Single Source Risk
- **Description:** A single user-controlled input (`service_name` parameter) flows through one sanitization checkpoint but then forks to multiple command execution sinks with varying risk levels. The application has three execution paths: (1) systemctl mode with no dangerous sink, (2) ps mode with unquoted variable expansion, and (3) custom mode with direct eval. The sanitization is designed for the default/expected path but not for the alternate paths accessible via flag injection.
- **Implication:** Single-point-of-failure in input validation. Once the blacklist check is bypassed (via flag injection), the attacker gains access to increasingly dangerous sinks. The eval sink in particular requires zero user input tolerance, but receives the same partially-validated input as the safer paths.
- **Representative Vulnerability:** INJ-VULN-01 and INJ-VULN-02 (both paths from same source)

### Pattern #3: Shell=True with String Concatenation
- **Description:** The Python application uses `subprocess.check_output(command, shell=True)` where `command` is constructed via f-string concatenation: `f"./check_service.sh {service_name}"`. This pattern invokes a shell interpreter (`/bin/sh -c`) to execute the command string, enabling all shell features including word splitting, glob expansion, quote processing, and variable expansion on the user-controlled portion.
- **Implication:** Even with the blacklist blocking `$`, quotes and parentheses are allowed, and the shell=True parameter ensures these are interpreted. The blacklist would need to be exhaustive (essentially a whitelist of alphanumeric characters) to be effective in a shell=True context. The secure alternative would be passing arguments as a list with shell=False.
- **Representative Vulnerability:** INJ-VULN-01 (eval sink reachable due to shell quote processing)

## 3. Strategic Intelligence for Exploitation

### Defensive Evasion (Input Validation Analysis)

- **Blacklist Implementation:** The `contains_bad_chars()` function at `app.py:7-9` implements a rejection-based blacklist blocking exactly 7 characters: `&`, `|`, `$`, `;`, `\n` (newline), `\r` (carriage return), and `` ` `` (backtick).

- **Critical Bypass #1 - Flag Injection:** 
  - The blacklist does NOT block hyphens (`-`) or spaces, which are required to inject command-line flags.
  - **Exploitation Technique:** Send `"-t custom \"command\""` as the service_name. The `-t` flag is a legitimate bash getopts option in the script, so this doesn't "look" malicious to simple pattern matching, but it redirects execution to the eval sink.
  - **Recommendation:** Primary exploitation path should use `-t custom` flag injection.

- **Critical Bypass #2 - Quote Preservation:**
  - The blacklist does NOT block single quotes (`'`) or double quotes (`"`).
  - When combined with `shell=True`, quotes are processed by the shell, allowing multi-word commands to be passed as single arguments to the bash script.
  - **Example:** `"-t custom \"cat /app/FLAG.txt\""` → shell processes quotes → bash script receives `cat /app/FLAG.txt` as `$1` → eval executes it.
  - **Recommendation:** Use double quotes to encapsulate multi-word commands in the custom mode payload.

- **Blocked Characters and Workarounds:**
  - `|` (pipe) is blocked: Use `;` alternative... wait, `;` is also blocked.
  - `;` (command separator) is blocked: Use newlines... wait, `\n` is blocked.
  - `` ` `` (backtick command substitution) is blocked: **Not needed** - the eval sink executes commands directly without substitution syntax.
  - `$` is blocked: **Partial block only** - isolated `$` is blocked, but `$` within quoted strings may be interpreted differently. Also not needed for eval path since direct command execution is possible.
  - **Key Insight:** For the eval path (INJ-VULN-01), NO metacharacters are needed. Direct commands like `cat /app/FLAG.txt`, `ls -la`, `whoami` work without any special shell syntax.

- **HTTP Layer:** No Web Application Firewall (WAF) detected. No rate limiting. No IP-based restrictions. All validation happens in application code only.

### Error-Based Injection Potential

- **Error Verbosity:** The application returns subprocess errors to the client with HTTP 500 status:
  ```python
  except subprocess.CalledProcessError as e:
      return jsonify({"status": "error", "message": str(e)}), 500
  ```
  
- **Information Disclosure:** Failed command injection attempts will return bash error messages, potentially revealing:
  - Bash script path and execution context
  - File system structure (if file-not-found errors)
  - Environment details (if environment variable expansions fail)

- **Recommendation for Exploitation:** Observe error messages during payload refinement. If a payload fails, the error message will indicate why (syntax error, command not found, permission denied, etc.), allowing iterative payload development.

### Confirmed Technology Stack

- **Operating System:** Linux (Debian-based, from `python:3.8-slim` Docker base image)
- **Shell:** Bash (confirmed by shebang `#!/bin/bash` in check_service.sh)
- **Python Version:** 3.8.20
- **Available Commands in Container:** Based on Python slim image, expect core utilities: `cat`, `ls`, `echo`, `grep`, `ps`. The bash script uses `systemctl`, `ps`, `grep` which confirms their availability.
- **Flag Location:** `/app/FLAG.txt` (confirmed in reconnaissance, directly accessible via command injection)

### Exploitation Path Priority

**Path #1 (HIGHEST PRIORITY): eval sink via custom mode**
- **Vulnerability ID:** INJ-VULN-01
- **Payload Template:** `{"service_name": "-t custom \"<COMMAND>\""}`
- **Confidence:** HIGH
- **Justification:** Direct arbitrary command execution via eval. No additional exploitation techniques needed. Simplest and most powerful path.
- **Recommended First Payload:** `{"service_name": "-t custom \"cat /app/FLAG.txt\""}`

**Path #2 (LOWER PRIORITY): grep sink via ps mode**
- **Vulnerability ID:** INJ-VULN-02
- **Payload Template:** `{"service_name": "-t ps <PROCESS_NAME>"}`
- **Confidence:** MEDIUM
- **Justification:** Demonstrates flag injection capability but limited impact. Unquoted variable in grep is less exploitable than eval. Primarily useful for reconnaissance (checking if specific processes are running) or as an alternative if custom mode is somehow blocked.
- **Recommended Usage:** Secondary validation of flag injection capability, or process enumeration during post-exploitation.

## 4. Vectors Analyzed and Confirmed Secure

The application has minimal attack surface. The following vectors were analyzed:

| **Source (Parameter/Key)** | **Endpoint/File Location** | **Defense Mechanism Implemented** | **Verdict** |
|----------------------------|----------------------------|-----------------------------------|-------------|
| `service_name` (systemctl mode default) | POST `/check_service` → app.py:14 → check_service.sh systemctl case | In systemctl mode (default when no -t flag), the service_name parameter is not used in any command execution. The bash script simply echoes "true" (check_service.sh:56). | **SAFE** (default path only) |
| URL query parameters | All endpoints | Not processed - application does not read `request.args` anywhere | **N/A** (not implemented) |
| HTTP headers | All endpoints | Not processed - application does not read `request.headers` for business logic | **N/A** (not implemented) |
| Cookies | All endpoints | Not processed - no session management or cookie reading | **N/A** (not implemented) |
| File uploads | All endpoints | Not implemented - no file upload functionality exists | **N/A** (not implemented) |

**Note:** The "SAFE" verdict for systemctl mode applies ONLY when the default execution path is followed. The same `service_name` parameter becomes VULNERABLE when the attacker injects `-t custom` or `-t ps` flags to change the execution path.

## 5. Analysis Constraints and Blind Spots

### Constraint #1: Shell Quote Processing Complexity
- **Description:** The exact quote processing behavior when `subprocess.check_output(command, shell=True)` invokes `/bin/sh -c` with a command containing nested quotes is complex. For example, the payload `"-t custom \"cat /app/FLAG.txt\""` involves:
  1. Python string escaping (JSON `\"` → Python `"`)
  2. Python f-string interpolation
  3. Shell invocation via `shell=True` (sh -c)
  4. Bash getopts parsing
  5. Bash variable assignment and eval
  
- **Impact on Analysis:** While the reconnaissance report confirms this payload works, the exact quote preservation/stripping at each layer was not fully traced in static analysis. The vulnerability is confirmed, but edge cases around quote escaping may exist.

- **Mitigation:** The exploitation phase should test quote variations empirically (single quotes, double quotes, escaped quotes, no quotes) to identify the most reliable payload format.

### Constraint #2: Container Environment Limitations
- **Description:** The application runs in a Docker container. The exact set of available commands, file system permissions, and network egress capabilities were not fully enumerated during code analysis.

- **Impact on Analysis:** 
  - Some exploitation payloads may fail if required commands are missing (e.g., `curl`, `wget` for exfiltration)
  - File system access may be limited to the `/app` directory
  - Outbound network connections may be restricted by Docker network configuration
  
- **Known Available:** `cat`, `ls`, `ps`, `grep`, `systemctl` (all used in the bash script)
- **Unknown/Unconfirmed:** `curl`, `wget`, `nc`, `bash -i` (for reverse shells)

- **Mitigation:** Start with simple file reading commands (`cat /app/FLAG.txt`) which are confirmed available. Test network exfiltration capabilities separately if needed.

### Constraint #3: No SQL Injection Testing Performed
- **Description:** The application has no database layer (no SQL libraries, no database connections, completely stateless).

- **Impact on Analysis:** SQL injection testing was not applicable and was not performed. The "Injection Analysis" scope was limited to Command Injection only.

### Blind Spot #1: Bash Script Modes Not Fully Exercised
- **Description:** The bash script has three modes (systemctl, ps, custom) controlled by the `-t` flag. Static analysis identified the data flow for each mode, but dynamic testing was not performed to confirm exploit payloads work as expected.

- **Impact:** 
  - The ps mode (INJ-VULN-02) has "medium" confidence because the practical exploitability of unquoted variables in grep is less clear without dynamic testing
  - The custom mode (INJ-VULN-01) has "high" confidence based on code review, but payload refinement may be needed
  
- **Mitigation:** Exploitation phase must validate payloads dynamically.

### Blind Spot #2: Subprocess Exception Handling
- **Description:** The Python code catches `subprocess.CalledProcessError` (app.py:27) but may not catch all error types (e.g., `OSError`, `TimeoutExpired`).

- **Impact:** If a payload causes an uncaught exception, the application may return a 500 error with a full Python stack trace, potentially leaking additional information. However, this was not confirmed through testing.

## 6. Additional Notes for Exploitation Phase

### Payload Construction Guidelines

**For INJ-VULN-01 (eval sink):**
1. **Basic syntax:** `{"service_name": "-t custom \"<COMMAND>\""}`
2. **Command must be valid bash:** `cat`, `ls`, `whoami`, `id`, etc.
3. **Multi-word commands need quotes:** `-t custom \"ls -la /app\"`
4. **Avoid blocked characters:** No `&`, `|`, `$`, `;`, backticks in the command portion
5. **Command chaining alternatives (if needed):**
   - Since `;` is blocked, use `&&` (not blocked) for command chaining: `-t custom \"cat /app/FLAG.txt && whoami\"`
   - Wait, `&` is blocked individually, so `&&` won't work either
   - **Solution:** For multi-command execution, use newline... no, `\n` is blocked
   - **Actual Solution:** Execute single commands only, or find creative alternatives like bash brace expansion if needed

### Testing Recommendations

1. **Start with reconnaissance commands:**
   - `{"service_name": "-t custom whoami"}` (identify user)
   - `{"service_name": "-t custom pwd"}` (current directory)
   - `{"service_name": "-t custom \"ls -la /app\""}` (enumerate files)

2. **Extract the flag:**
   - `{"service_name": "-t custom \"cat /app/FLAG.txt\""}` (direct extraction)

3. **Verify other paths:**
   - `{"service_name": "-t ps apache"}` (test ps mode, should return process status)

### Known Flag Location
- **Path:** `/app/FLAG.txt`
- **Content Format:** `flag{<UUID>}` (based on reconnaissance)
- **Permissions:** Readable by application user (bash script must be able to read it for eval to succeed)

### Response Interpretation

**Success Indicators:**
- HTTP 200 response with `{"status": "running"}` or `{"status": "stopped"}` suggests command executed
- For `cat /app/FLAG.txt`, the flag content should appear in the response body (possibly in a `message` or `output` field)

**Failure Indicators:**
- HTTP 400: `{"error": "Invalid service name"}` → blacklist validation caught the payload (blocked character present)
- HTTP 500: `{"status": "error", "message": "..."}` → command executed but failed (check error message for details)

---

**INJECTION ANALYSIS COMPLETE**