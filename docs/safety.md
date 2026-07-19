# Safety and Limitations

Read this before running Shannon in a new environment.

## Authorized Use Only

Shannon is designed for legitimate security auditing. You must have explicit written authorization from the owner of the target system before running Shannon.

Unauthorized scanning or exploitation of systems you do not own is illegal. Keygraph is not responsible for misuse of Shannon.

## Do Not Run on Production

Shannon is not a passive scanner. Exploitation agents actively execute attacks to confirm vulnerabilities. This can mutate application state and data.

Do not run Shannon against production systems. Use sandboxed, staging, or local development environments where data integrity is not a concern.

Potential mutative effects include:

- Creating new users
- Modifying or deleting data
- Compromising test accounts
- Triggering unintended side effects from injection attacks
- Generating unexpected outbound traffic
- Writing exploit artifacts to reports or deliverables

For maximum isolation, run Shannon inside a disposable virtual machine.

## LLM and Automation Caveats

- **Verification is required**: Shannon uses an evidence-backed exploitation methodology, but final reports can still contain weakly supported or incorrect details. Human review is essential.
- **Model support**: Shannon supports OpenAI GPT-5.6 and Claude through the Pi harness. Provider safeguards and model behavior can vary; validate outputs and custom model overrides before relying on a report.
- **Prompt injection risk**: Do not point Shannon at untrusted or adversarial codebases. AI-powered tools that read source code can be influenced by malicious repository content.

## Scope of Analysis

Shannon currently targets exploitable vulnerabilities in these classes:

- Broken Authentication
- Broken Authorization
- Injection
- Cross-Site Scripting
- Server-Side Request Forgery

Shannon's evidence-backed exploitation model does not report dependency, configuration, or broad policy issues that lack a supported network-reachable attack path. It can report a real vulnerability when code or live evidence supports it but a security control or external condition blocks full exploitation after exhaustive documented attempts.

## Completion and Audit Guarantees

- Pre-reconnaissance, reconnaissance, and vulnerability-analysis phases must fill every required structured collector section before their deliverables can be committed.
- Every exploitation-queue ID must receive exactly one verdict: `exploited`, `blocked`, `false_positive`, or `out_of_scope`.
- Human-facing reports include only `exploited` and evidence-backed `blocked` findings. False positives and out-of-scope candidates remain in per-class `*_exploitation_audit.json` files for traceability.
- An incomplete exploit verdict set fails closed and is not automatically rerun, because replaying a live exploitation phase could repeat state-changing requests.
- Severity and confidence thresholds are applied deterministically. A finding omitted by free-form report guidance must be recorded with its ID and reason in `report_exclusions.json`; every other eligible ID must appear exactly once in the final report.

For broader coverage, the Keygraph platform adds black-box and white-box agentic pentesting, graph-based static analysis, SCA reachability, secrets detection, business logic testing, remediation workflows, SLA tracking, and reporting dashboards.

## Cost and Performance

A full test run typically takes roughly 1 to 1.5 hours. LLM API costs vary by model pricing, target complexity, selected provider, and concurrency.

If you use subscription-based model access, consider the rate-limit guidance in [Configuration](configuration.md).
