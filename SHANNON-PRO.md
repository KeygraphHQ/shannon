# Shannon Pro

Shannon Pro is Keygraph's comprehensive AppSec platform, combining SAST, SCA, secrets scanning, business logic security testing, and autonomous pentesting in a single correlated workflow:

- **Agentic static analysis:** CPG-based data flow, SCA with reachability, secrets detection, business logic security testing
- **Static-dynamic correlation:** static findings are fed into the dynamic pipeline and exploited against the running application, so every reported vulnerability has a working proof-of-concept
- **Enterprise deployment:** self-hosted runner (code and LLM calls never leave customer infrastructure), CI/CD integration, GitHub PR scanning, service boundary detection

The platform cross-references static and dynamic results to eliminate false positives, prioritize by proven exploitability, and produce pentest-grade reports with reproducible proof-of-concept exploits for every finding.

---

## The Problem: Fragmented AppSec and Alert Fatigue

Modern engineering teams face two compounding security challenges. First, traditional static analysis tools (SCA, SAST, and secrets scanners) operate without context, producing high volumes of false positives that erode developer trust. Second, penetration testing remains an expensive, periodic exercise that cannot keep pace with continuous deployment. The result is a fragmented security posture where static tools cry wolf, dynamic assessments arrive too late, and engineering teams treat security as compliance theater rather than a source of genuine protection.

Shannon Pro addresses both problems in a single platform by replacing pattern-based static analysis with LLM-powered reasoning and augmenting it with a fully autonomous AI pentester that validates findings at runtime. The platform supports a self-hosted runner model where source code and LLM interactions never leave the customer's infrastructure.

---

## Platform Architecture Overview

Shannon Pro operates as a two-stage pipeline: agentic static analysis of the codebase, followed by autonomous dynamic penetration testing against the running application. Findings from both stages are correlated to produce a unified, high-confidence result set.

---

# Stage 1: Agentic Static Analysis (AppSec)

The static analysis stage performs comprehensive code-level security assessment using LLM-powered agents. It comprises five core capabilities: SAST (data flow analysis, point issue detection, and business logic security testing), SCA with reachability analysis, and secrets detection.

## SAST: Data Flow Analysis

Shannon Pro transforms the target codebase into a Code Property Graph (CPG) that combines the abstract syntax tree, control flow graph, and program dependence graph into a unified structure. Nodes represent program constructs (such as expressions, statements, and declarations), and edges capture syntactic, control-flow, and data-dependence relationships. The analysis proceeds in three phases.

### Phase 1: Source and Sink Extraction

For each vulnerability type, the system identifies sources (where untrusted data enters, such as user input, API requests, and file reads) and sinks (where that data could cause harm, such as SQL queries, command execution, and file writes). Deterministic pattern matching establishes a baseline, then an AI agent analyzes the codebase to discover sources and sinks that generic patterns miss, including custom input handlers and framework-specific patterns unique to the target codebase. A filtering agent removes irrelevant results such as test fixtures and mock data.

### Phase 2: Path Tracing with Contextual Reasoning

This is where Shannon Pro's approach differs fundamentally from traditional SAST. The system traces backward from each sink toward potential sources. At every node along the path, an LLM analyzes whether sanitization is applied at that exact point and whether that sanitization is sufficient for this specific vulnerability in this specific context.

The key insight is that security fixes are context-dependent. A function that makes data safe for one SQL query might not protect a different query. A custom sanitizer that a team wrote will not be recognized by pattern-based tools. Traditional tools rely on a hard-coded list of safe functions; Shannon Pro reasons about what the code is actually doing, validating whether the specific sanitization at each node actually addresses the specific risk at the specific sink.

### Phase 3: Path Validation

Each identified vulnerability path is validated by an autonomous Claude agent that confirms control flow correctness (is the path actually executable?) and logic correctness (is the vulnerability real or a false positive?). Agents produce confidence scores, and only validated paths proceed to reporting.

## SAST: Point Issue Detection

Point issues are vulnerabilities where security depends on what is happening at a single location rather than across a data flow path. The system pre-filters and organizes files, then feeds each one to an LLM to identify issues such as:

- Use of weak encryption algorithms
- Hardcoded credentials or API keys
- Insecure configuration settings (e.g., debug mode enabled in production)
- Missing security headers
- Weak random number generation
- Disabled certificate validation
- Overly permissive CORS settings

## SAST: Business Logic Security Testing

Traditional security testing tools cannot reason about application-specific correctness properties. Pattern-based scanners look for known vulnerability signatures; conventional fuzzers (AFL, libFuzzer) find crashes and memory errors through input mutation but operate without awareness of business semantics. Neither can determine whether a syntactically valid response actually violates the application's security model. Shannon Pro bridges this gap with automated invariant-based security testing: LLM agents that understand the business semantics of the codebase, automatically discover application-specific invariants, and generate targeted test scenarios that verify whether those invariants hold under adversarial conditions. This approach draws from property-based testing methodology, applied specifically to security-relevant business logic.

### Why Business Logic Bugs Are Missed

Pattern-based scanners and traditional SAST are structurally incapable of finding business logic vulnerabilities. These bugs do not involve malformed input reaching a dangerous sink. Instead, they involve legitimate operations that violate unstated rules about how the application should behave. A multi-tenant SaaS platform assumes Organization A's data is never accessible to Organization B. An e-commerce application assumes a checkout total cannot go negative. A healthcare platform assumes a patient record is only visible to the assigned provider. These invariants are implicit in the business domain, never encoded in a generic vulnerability database, and invisible to any tool that does not understand what the application is supposed to do.

### How It Works

Shannon Pro's business logic security testing operates in four phases:

**Phase 1: Invariant Discovery.** An LLM agent performs a deep semantic analysis of the codebase, examining data models, API endpoints, authorization logic, and domain-specific patterns. Rather than looking for known vulnerability signatures, the agent reasons about the application's intended behavior and derives business logic invariants: rules that must hold for the application to be secure. For a multi-tenant platform, the agent identifies invariants such as "document access must verify that the document belongs to the requesting user's organization." For a financial application, it might identify "a transfer cannot be initiated where the source and destination accounts have the same owner but different privilege levels." These are security properties that no generic scanner can know about because they are unique to each application.

**Phase 2: Fuzzer Generation.** For each discovered invariant, a second agent generates a targeted fuzzer: a test scenario designed to violate the invariant. These are not random inputs. The agent reads the code, understands the expected authorization checks (or lack thereof), and constructs specific adversarial scenarios. For an authorization invariant, the fuzzer might construct a request where a user from one organization references a resource belonging to another organization. For a state machine invariant, it might craft a sequence of API calls that skips a required approval step.

**Phase 3: Violation Detection.** The generated fuzzers are executed against a stubbed test environment that replicates the application's business logic with mocked dependencies. When a fuzzer succeeds, meaning the invariant does not hold, the system has identified a confirmed business logic vulnerability. The agent traces the violation back to the specific code location where the missing check or flawed logic exists.

**Phase 4: Exploit Synthesis.** For every confirmed violation, the system produces a full proof-of-concept exploit with step-by-step reproduction instructions, the specific API calls or user actions required, the observed versus expected behavior, and the security impact.

### Real-World Example: Cross-Tenant Data Access (CWE-639)

In a production multi-tenant platform, Shannon Pro's business logic security testing discovered a critical Insecure Direct Object Reference (IDOR) vulnerability that no traditional scanner would detect.

**Invariant discovered:** Document access must verify that the document belongs to the requesting user's organization.

**Fuzzer generated:** The agent extracted the `GetDocument` handler logic into a stubbed test environment, mocking the database layer to return documents with known organization IDs. The fuzzer generated combinations of requesting user organizations and document owner organizations, testing whether the handler enforces organizational boundaries.

**Violation confirmed:** An attacker from Organization B can access documents belonging to Organization A by calling the `GetDocument` endpoint with the victim's document ID, without any authorization check preventing cross-organization access.

**Exploit synthesized:**

1. Attacker authenticates as a user in Organization B and obtains valid credentials.
2. Attacker enumerates or guesses a document ID belonging to Organization A (e.g., through sequential ID guessing, leaked references, or predictable UUID patterns).
3. Attacker calls `GET /api/document?document_id=victim-doc-123` with their Organization B credentials.
4. The system retrieves the document without verifying organizational ownership.
5. The system returns HTTP 200 with the complete document contents, including sensitive data belonging to Organization A.

**Impact:** Complete breach of multi-tenant data isolation. Attackers can read all documents across all organizations, potentially exposing confidential business data, PII, trade secrets, and compliance-sensitive information.

**Expected behavior:** HTTP 403 Forbidden with an error message indicating access is denied, or HTTP 404 Not Found to avoid leaking document existence.

This class of vulnerability, missing authorization at an organizational boundary, is invisible to pattern-based tools because the code is syntactically correct, uses no dangerous functions, and follows normal request-handling patterns. Only a system that understands the business invariant ("documents belong to organizations, and access must respect that boundary") can identify the violation.

### What This Means

Business logic security testing extends Shannon Pro's coverage beyond the limits of traditional static and dynamic analysis. Data flow analysis catches injection, XSS, and other input-driven vulnerabilities. Point issue detection catches configuration and cryptographic weaknesses. Business logic security testing catches the authorization failures, state machine violations, and domain-specific logic errors that represent some of the most severe and most commonly missed vulnerabilities in production applications. Together, these three capabilities provide comprehensive SAST coverage across the full vulnerability spectrum.

## SCA with Reachability Analysis

Traditional SCA flags any library with a known CVE regardless of whether the vulnerable function is called or even reachable. Shannon Pro goes further with a four-step reachability process:

1. An AI agent researches each CVE to identify the exact vulnerable function, framework, or conditions.
2. For framework-level issues, the system checks whether the application actually uses the affected framework in practice.
3. For function-level issues, the CPG is queried to extract nodes where the vulnerable function is used. If no nodes are found, the vulnerability is marked as not reachable.
4. If nodes are found, execution flow is traced from entry points (main functions, API endpoints) to determine whether a path exists. Proven executable vulnerabilities are flagged; code that uses the function but is not currently callable is marked as likely reachable.

## Secrets Detection

Shannon Pro combines three approaches to secrets scanning. Standard regex-based pattern matching catches known formats (AWS keys, API tokens, etc.). Simultaneously, during the point issue detection phase, LLM-based detection catches secrets that standard patterns miss, such as dynamically constructed credentials, custom credential formats, and obfuscated tokens. The LLM layer also filters out test data, placeholders, and documentation examples that regex scanners frequently flag as false positives.

For discovered secrets, Shannon Pro performs liveness validation: an agent determines the API context for each credential and attempts to authenticate against the corresponding service. This distinguishes active, exploitable secrets from revoked or rotated credentials, ensuring teams focus remediation effort on secrets that represent real exposure. Liveness checks use read-only API calls (e.g., identity verification endpoints) to avoid triggering side effects or account lockouts, and in the self-hosted runner deployment, all validation occurs within the customer's network.

## Boundary Analysis

For large-scale or monorepo architectures, Shannon Pro's boundary analysis capability allows organizations to scope scans to specific services or portions of the codebase. An agent analyzes the repository and identifies logical boundaries (by service, frontend vs. backend, microservice, etc.). Users review, confirm, and optionally edit the detected boundaries, then select which to include in a scan. Findings are tagged by boundary, enabling clear routing to the responsible team.

## False Positive Tagging

Any finding can be marked as a false positive. On subsequent scans, the same finding will be flagged as likely false positive, so teams do not repeatedly triage issues they have already dismissed.

---

# Stage 2: Autonomous Dynamic Penetration Testing

Shannon Pro's dynamic testing pipeline mirrors the workflow of a professional human penetration tester, implemented as a multi-agent system powered by the Anthropic Claude Agent SDK. The system operates through five phases using 13 specialized agents.

## Execution Model

Phases 1 and 2 (reconnaissance) run sequentially. Phases 3 and 4 (vulnerability analysis and exploitation) run as pipelined parallel: each vulnerability/exploit pair is independent. When a vulnerability agent finishes for a given attack domain, the corresponding exploit agent starts immediately, even if other vulnerability agents are still running. Phase 5 (reporting) runs after all exploitation is complete.

## Phase 1: Pre-Reconnaissance

Pure static analysis of the source code without browser interaction. The pre-recon agent maps the application architecture, identifies security-relevant components (authentication systems, database access patterns, input handling), and catalogs the complete attack surface from a code perspective. Outputs include a comprehensive catalog of all network-accessible entry points, technology stack details, authentication and authorization mechanisms, and all identified sinks (XSS, SSRF, injection) with their locations.

This phase informs everything downstream. If the codebase uses an ORM with parameterized queries everywhere, the injection agents know to focus elsewhere.

## Phase 2: Reconnaissance

Bridges static and dynamic analysis using browser automation. The recon agent correlates code findings with the live application, validating that endpoints actually exist, mapping authentication flows, inventorying input vectors (URL parameters, POST fields, headers, cookies), and documenting the real authorization architecture. This phase may also integrate with infrastructure discovery tools including Nmap, Subfinder, and WhatWeb for network perimeter mapping.

## Phase 3: Vulnerability Analysis

Five parallel agents, each focused on a distinct attack domain, combine code analysis with runtime probing to generate exploitation hypotheses. Each agent produces a detailed analysis deliverable and an exploitation queue -- a structured JSON file listing specific vulnerabilities to attempt, including the type, location, method, parameter, code evidence, and a suggested initial payload.

The five vulnerability analysis agents and their methodologies:

| Agent | Approach | What It Analyzes |
| --- | --- | --- |
| **Injection** | Source -> Sink taint | User input reaching SQL, command, file, template, or deserialization sinks without adequate sanitization |
| **XSS** | Sink -> Source taint | HTML rendering contexts (innerHTML, document.write, event handlers, eval) reachable from user input without proper encoding |
| **SSRF** | Sink -> Source taint | HTTP client libraries, raw sockets, URL openers, and headless browsers callable with user-controlled URLs |
| **Auth** | Guard validation | Missing security controls: rate limiting, session management, token entropy, password hashing, HSTS, SSO/OAuth configuration |
| **Authz** | Guard validation | Missing authorization checks before side effects: horizontal (ownership), vertical (role/capability), and context/workflow violations |

If a vulnerability agent's exploitation queue is empty for a given attack domain, the corresponding exploit agent is skipped entirely, saving significant time and cost.

## Phase 4: Exploitation

Five parallel exploit agents consume the exploitation queues and attempt to verify each hypothesis using full Playwright browser automation. Agents can navigate to endpoints, fill forms with crafted payloads, submit requests, observe responses, take screenshots, and chain multiple requests together to validate complex attack sequences.

**Core principle: POC or it didn't happen.** Shannon Pro never reports a vulnerability without a working proof-of-concept exploit. Exploitation agents classify each finding as EXPLOITED, POTENTIAL, or FALSE POSITIVE. Only EXPLOITED findings (with concrete evidence) make it to the final report. POTENTIAL findings are programmatically stripped before reporting, giving agents a designated space to log uncertain observations without polluting the deliverable.

## Phase 5: Reporting

A reporting agent synthesizes all evidence files into a pentest-grade executive report. The agent only sees confirmed findings (evidence files from Phase 4), never raw hypotheses. It de-duplicates findings, assesses severity, and provides remediation guidance. Every reported vulnerability includes reproducible steps and copy-and-paste commands for verification.

---

# Static-Dynamic Correlation

Shannon Pro's distinguishing capability is the correlation between its static and dynamic analysis stages.

## How AppSec Feeds Into Dynamic Testing

After static analysis completes, findings go through an enrichment phase that adds priority, confidence, and application context. CWEs are mapped to Shannon's five attack domains using a best-fit heuristic. Where a CWE maps to multiple domains (e.g., CWE-918 spans both SSRF and injection contexts), the finding is routed to the most exploitation-relevant agent. CWEs that do not map cleanly to any attack domain, such as certain business logic classes, are routed directly to the exploitation queue with their static analysis context preserved rather than forced into an ill-fitting category. Secrets, data flow findings, point issues, and business logic security testing violations are sent to Shannon's exploitation queue, where domain-specific agents attempt to exploit each finding with real proof-of-concept attacks against the running application.

This correlation means that a data flow vulnerability identified in static analysis (e.g., unsanitized user input reaching a SQL query) is not just reported as a theoretical risk -- it is actively exploited against the live application. Similarly, a business logic invariant violation (e.g., missing cross-tenant authorization) identified by the security testing engine is fed directly into the Authz exploitation agent, which attempts to reproduce the exact cross-organization access scenario against the running application. Confirmed exploits are traced back to their source code location, giving developers both the proof that the vulnerability is real and the exact line of code to fix.

---

# Key Technical Capabilities

- **Fully Autonomous Operation:** Shannon Pro handles complex workflows including 2FA/TOTP logins and SSO (e.g., Sign in with Google) without human intervention. TOTP is handled via a dedicated MCP server tool.
- **White-Box Awareness:** Unlike black-box scanners, Shannon Pro reads the source code to intelligently guide its attack strategy, combining code-level insight with runtime validation.
- **Parallel Processing:** Vulnerability analysis and exploitation phases run concurrently across attack domains, with pipelined parallelism minimizing total execution time.
- **Tool Orchestration:** Shannon Pro orchestrates existing security tools (e.g., Schemathesis for API testing, Nmap for network discovery) while adding LLM reasoning to interpret results.
- **Configurable Login Flows:** Authentication configuration specifies login procedures and credentials, which are interpolated into agent prompts for authenticated testing.

---

# Container Isolation and Data Security

Shannon Pro is engineered with a secure-by-design philosophy to ensure code privacy and isolation across every stage of the pipeline.

## Per-Organization Infrastructure

Each organization receives its own isolated compute environment. In the managed deployment, Keygraph provisions dedicated ECS infrastructure (containers, IAM roles, task queues) per organization. In the self-hosted runner deployment, the organization provisions and controls the data plane, which handles all code access and LLM calls using the organization's own API keys. The Keygraph control plane receives only aggregate findings. In either model, organizations never share compute environments with other organizations.

## Ephemeral Code Handling

When a scan runs, the target repository is cloned to a temporary workspace inside the isolated container. The scan executes against this local copy. Immediately after the scan completes, the entire workspace is deleted, including all cloned code. Source code is never persisted after a scan finishes. Even if a scan fails or is cancelled, a disconnected cleanup process executes regardless of how the scan terminates.

In the self-hosted runner deployment, all code handling occurs within the customer's own infrastructure. Keygraph's control plane never receives, processes, or stores source code.

## Encrypted Storage

Code snippets associated with findings are encrypted before being written to the database. Deliverables uploaded to S3 are encrypted at rest. Each organization's data is stored in org-specific buckets with org-scoped access policies.

## Network Isolation

Isolated workers run in private subnets with org-specific security groups, ensuring network-level separation between customer workloads.

## Self-Hosted Runner

Shannon Pro supports a self-hosted runner deployment model, following the same architecture as GitHub Actions self-hosted runners. The data plane (the runner that clones code, executes scans, and makes all LLM API calls) runs entirely within the customer's infrastructure using the customer's own LLM API keys. Source code never leaves the customer's network, and no code or LLM interactions pass through Keygraph's systems. The control plane (job orchestration, scan scheduling, and the reporting UI) is hosted by Keygraph and receives only aggregate findings to power dashboards, search, and reporting. This separation ensures that Keygraph never has access to customer source code or raw LLM call content.

---

# Deployment and Editions

Shannon is offered in two editions to serve different operational needs:

| Feature | Shannon Lite | Shannon Pro |
| --- | --- | --- |
| **Licensing** | AGPL-3.0 (open source) | Commercial |
| **Static Analysis** | Code review prompting | Full agentic static analysis (SAST, SCA, secrets, business logic security testing) |
| **Dynamic Testing** | Autonomous AI pentest framework | Autonomous AI pentesting with static-dynamic correlation |
| **Analysis Engine** | Code review prompting | CPG-based data flow with LLM reasoning at every node |
| **Business Logic** | N/A | Automated invariant discovery, test scenario generation, and exploit synthesis |
| **Integration** | Manual / CLI | Native CI/CD, GitHub PR scanning, enterprise support, self-hosted runner |
| **Deployment** | CLI / manual | Managed cloud or self-hosted runner (customer data plane, Keygraph control plane) |
| **Boundary Analysis** | N/A | Automatic service boundary detection with team routing |
| **Best For** | Local testing of own applications | Enterprise application security posture management |

---

# Compliance Integration

Within the broader Keygraph ecosystem, Shannon Pro serves as the primary engine for automated compliance evidence generation. By automating penetration testing and static analysis requirements, Shannon Pro generates real-time evidence for frameworks such as SOC 2 and HIPAA, transforming security testing from a periodic audit obligation into a continuous component of the compliance program.

---

# Methodology Standards

Shannon Pro follows AI-assisted white-box testing methodology broadly aligned with OWASP Web Security Testing Guide (WSTG) and OWASP Top 10 standards. All dynamic testing produces confirmed, exploitable findings with reproducible proof-of-concept exploits. Static analysis covers established CWE categories with LLM-powered validation to minimize false positive rates.
