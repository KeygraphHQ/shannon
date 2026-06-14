# Safety and Limitations

Read this before running Shannon Lite in a new environment.

## Authorized Use Only

Shannon Lite is designed for legitimate security auditing. You must have explicit written authorization from the owner of the target system before running Shannon Lite.

Unauthorized scanning or exploitation of systems you do not own is illegal. Keygraph is not responsible for misuse of Shannon Lite.

## Do Not Run on Production

Shannon Lite is not a passive scanner. Exploitation agents actively execute attacks to confirm vulnerabilities. This can mutate application state and data.

Do not run Shannon Lite against production systems. Use sandboxed, staging, or local development environments where data integrity is not a concern.

Potential mutative effects include:

- Creating new users
- Modifying or deleting data
- Compromising test accounts
- Triggering unintended side effects from injection attacks
- Generating unexpected outbound traffic
- Writing exploit artifacts to reports or deliverables

For maximum isolation, run Shannon Lite inside a disposable virtual machine.

## LLM and Automation Caveats

- **Verification is required**: Shannon Lite uses a proof-by-exploitation methodology, but final reports can still contain weakly supported or incorrect details. Human review is essential.
- **Model support**: Shannon Lite is officially supported only with Claude models. Alternative models may be incomplete, inaccurate, or unstable.
- **Prompt injection risk**: Do not point Shannon Lite at untrusted or adversarial codebases. AI-powered tools that read source code can be influenced by malicious repository content.

## Scope of Analysis

Shannon Lite currently targets exploitable vulnerabilities in these classes:

- Broken Authentication
- Broken Authorization
- Injection
- Cross-Site Scripting
- Server-Side Request Forgery

Shannon Lite's proof-by-exploitation model means it does not report issues it cannot actively exploit, such as many vulnerable dependency, insecure configuration, or broad policy findings.

For broader coverage, Shannon Pro adds black-box and white-box agentic pentesting, graph-based static analysis, SCA reachability, secrets detection, business logic testing, remediation workflows, SLA tracking, and reporting dashboards.

## Cost and Performance

A full test run typically takes roughly 1 to 1.5 hours. LLM API costs vary by model pricing, target complexity, selected provider, and concurrency.

If you use subscription-based model access, consider the rate-limit guidance in [Configuration](configuration.md).
