# Keygraph Platform

The Keygraph platform is Keygraph's commercial continuous pentesting and AppSec platform for teams running security across many repositories, services, and environments. While Shannon is a local white-box pentesting CLI, the Keygraph platform is a complete AppSec system: it combines parsed-code SAST, source-to-sink analysis, black-box and white-box agentic pentesting, verified remediation, CI/CD gating, SLA tracking, and reporting for security and compliance teams.

This repository contains Shannon, the AGPL-3.0 open-source CLI for strictly white-box pentesting. The Keygraph platform supports both white-box and black-box agentic pentesting and adds static analysis, finding management, remediation workflows, reporting, and enterprise deployment options.

## Who Should Consider the Keygraph Platform

The Keygraph platform is intended for organizations that need:

- Continuous AppSec coverage across many repositories and services
- White-box pentesting when source code is available
- Black-box pentesting against deployed applications and APIs without source-code access
- Agentic SAST, SCA with reachability, secrets scanning, IaC scanning, container scanning, and business logic testing
- Canonical finding management, deduplication, ownership, status tracking, and severity tracking
- Sync into developer workflows, including ticketing and source-control systems
- User-initiated remediation with verification before delivery
- SLA tracking, reporting dashboards, and compliance evidence
- Commercial support
- Self-hosted, air-gapped, BYOK, and customer-controlled LLM gateway deployment options

## Full Vulnerability Lifecycle

The Keygraph platform is designed to cover the full vulnerability lifecycle, not only discovery:

1. **Find** exploitable issues with white-box pentesting, black-box pentesting, SAST, SCA, secrets, IaC, container, and business logic testing.
2. **Normalize** results into canonical findings so duplicate scanner outputs become one tracked vulnerability per repository.
3. **Prioritize** findings using exploit evidence, reachability, severity, ownership, and business context.
4. **Sync** work into developer workflows through ticketing and source-control integrations.
5. **Remediate** with user-initiated patch generation when teams want help moving from evidence to code changes.
6. **Verify** fixes by re-running the relevant scanner or exploit workflow before a remediation is delivered.
7. **Track** ownership, status, SLAs, MTTR, and drift over time.
8. **Report** through dashboards for risk, trends, compliance evidence, and security program operations.

## Pentesting Modes

Shannon is strictly white-box: it requires access to the target application's source code and repository layout.

The Keygraph platform supports two pentesting modes:

- **White-box agentic pentesting**: Agents use source-code context to understand architecture, identify realistic attack paths, and validate exploitability against the running application.
- **Black-box agentic pentesting**: Agents test deployed applications and APIs without source-code access, useful for third-party surfaces, production-like external validation, or environments where source access is unavailable.

Both modes follow the same core principle: do not report what might be vulnerable when an exploit can prove what is vulnerable.

## AppSec Coverage

The Keygraph platform combines agentic pentesting with broader AppSec coverage:

- **Agentic SAST**: Code Property Graph analysis with LLM reasoning for data flow, context, and sanitization decisions.
- **SCA with reachability**: Dependency vulnerability analysis that prioritizes issues reachable from application entry points.
- **Secrets scanning**: Detection and validation of credentials, tokens, and API keys.
- **Business logic testing**: Authorization bypass, IDOR, workflow abuse, state-machine flaws, race conditions, and other application-specific logic issues.
- **IaC scanning**: Terraform, CloudFormation, Kubernetes, Helm, and related infrastructure configuration checks.
- **Container scanning**: Vulnerable packages, exposed secrets, and misconfigurations across image layers.

## Static-Dynamic Correlation

Static-dynamic correlation is a core product difference. A static finding, such as unsanitized input reaching a SQL query, is not treated as a purely theoretical issue. It is sent to an exploit agent, tested against the live application, and traced back to the exact source-code location when confirmed.

The result is a finding with proof of exploitability, source context when available, ownership, status, SLA, remediation history, and reporting metadata.

## Enterprise Deployment

The Keygraph platform supports enterprise deployment patterns for teams with strict data, model, and network requirements:

- **Self-hosted deployments** inside the customer's cloud or infrastructure
- **Air-gapped deployments** for isolated environments
- **Strict BYOK model access** using customer-managed model credentials
- **Customer-controlled LLM gateway patterns** for routing, policy, logging, and isolation
- **Enterprise identity and provisioning** such as SSO and SCIM
- **Deep integrations** with source control, ticketing, chat, registries, and cloud environments

Deployments can be designed so source code, scan results, prompts, completions, and model traffic remain inside the customer's security perimeter.

## Capability Comparison

| Need | Shannon | Keygraph platform |
| --- | --- | --- |
| Licensing | AGPL-3.0 | Commercial |
| White-box pentesting | Yes; source code required | Yes; source-aware testing with platform workflows |
| Black-box pentesting | No | Yes; autonomous testing without source-code access |
| Code analysis / SAST | Prompting and source pass-through to guide pentesting | Actual code parsing, Code Property Graph analysis, source-to-sink path analysis, and agentic SAST |
| AppSec coverage | OWASP-focused agentic pentesting | Agentic pentesting, SAST, SCA, secrets, IaC, containers, and business logic testing |
| CI/CD and gating | Manual/local CLI runs | Headless commercial CLI for CI/CD gating across enterprise CI/CD platforms |
| Finding lifecycle | Local Markdown reports | Canonical findings, deduplication, ownership, status, SLA tracking, workflow sync, and reporting dashboards |
| Remediation | Manual | User-initiated remediation with verification before delivery |
| Fix verification | None; manual reruns only | Targeted verification without rerunning the entire scan, completing the remediation lifecycle |
| Enterprise deployment | Local CLI and Docker worker | Self-hosted, air-gapped, BYOK, and customer-controlled LLM gateway options |
| Support | Community | Commercial support |

## Contact

Learn more on the [Keygraph website](https://keygraph.io), start a free trial, book a [Keygraph demo](https://cal.com/team/keygraph/shannon-pro), or contact [shannon@keygraph.io](mailto:shannon@keygraph.io).
