# Keygraph Enterprise Platform

Shannon 3.0 is an open-source pentester. It reads your source, maps routes and data flows, runs real attacks against a live target, and writes PDF and SARIF reports. It runs locally, in CI, or air-gapped with your own model. Shannon Open Source is a complete pentester, not a trial edition.

Keygraph Enterprise runs an enterprise-hardened fork of Shannon continuously across hundreds of repositories and adds what a security team needs around it: audit-depth static analysis on a parsed code graph, business-logic testing, SCA and secrets scanning, one deduplicated record per vulnerability across scans and scanners, generated fixes, fix verification, and SSO, RBAC, and audit logs. It is for security teams that own vulnerability management across many engineering teams and need one place to triage, assign, fix, and verify.

Both editions are BYOK. Keygraph never receives your source and never proxies model traffic, open source or commercial. Shannon Open Source runs from your machine or CI runner. Keygraph Enterprise deploys as a platform inside your cloud or data center, including fully air-gapped.

## Shannon Open Source vs. Keygraph Enterprise

| | Shannon Open Source | Keygraph Enterprise |
| --- | --- | --- |
| Best for | Developers and teams running repository-level pentests locally or in CI | Security organizations running continuous AppSec across many teams and repositories |
| Code analysis | Agent pass over architecture, entry points, and data flows to seed the pentest, sized to finish inside a CI run | Persistent code property graph plus a long-running analysis harness with interprocedural taint, sanitizer modeling, cross-repo context, exploit chains, and multi-pass review |
| Pentesting | On-demand, source-aware white-box pentesting with optional authenticated testing, focused on injection, XSS, SSRF, broken authentication, and broken authorization, with proof by exploitation | Enterprise-hardened Shannon fork run continuously, with grey-box and black-box targets and business-logic invariant testing |
| SCA and secrets | Not included | SCA with reachability and secrets scanning including history |
| Findings | Per-run PDF, Markdown, JSON, and SARIF, with SARIF ingestion into GitHub code scanning | One record per vulnerability per repo across scans and scanners, plus ownership, SLAs, dashboards, and audit evidence |
| Fixes and verification | Not included | Fix PRs with verification by re-analysis and exploit replay, with no full rescan required |
| CI/CD and source control | GitHub Action and GitLab CI component for pull-request, release, and scheduled runs, with gates on `status: exploited` | GitHub, GitLab, Azure DevOps, and Bitbucket with organization-wide policy and centrally managed integrations |
| Deployment and models | Runs locally or on a CI runner with BYOK to any Anthropic- or OpenAI-compatible endpoint or local model | Deployed in your AWS, GCP, Azure, or on-prem environment. Customer-hosted services and stored platform data remain inside your environment. Model requests go directly to the provider, private endpoint, gateway, or local model you configure. A local model supports fully disconnected deployments |
| Governance, license, support | AGPL-3.0 and community support | SSO, SCIM, RBAC, and audit logs, plus a commercial license, enterprise support, and SOC 2 Type II |

## How it fits your pipeline

1. Scans run on pull requests, releases, and a schedule against repositories in GitHub, GitLab, Azure DevOps, or Bitbucket.
2. Pipelines gate on exploited severity. A code-analysis hypothesis never fails a build.
3. Findings from every scanner and every run land as one record per vulnerability per repository, with an owner and an SLA. The same finding across ten runs is one record, not ten alerts.
4. From a finding, Keygraph opens a fix PR into your normal review flow.
5. Verification confirms the fix against the changed code and the original exploit. No full rescan is required.

## What is different technically

### Static analysis on a code property graph

Shannon Open Source's code analysis is sized to finish inside a CI run: agents read the repository, map the attack surface, and hand candidates to the pentester. Enterprise is built for depth instead. It first parses each repository into a persistent code property graph, then runs an analysis harness derived from one built for long-running vulnerability audits, heavily adapted to query the graph rather than read files. The harness decomposes the application into risk, taint-flow, framework, and specialist tasks and supports longer-running audit workflows beyond typical CI job windows.

On the graph, it performs:

- Interprocedural taint tracking across functions, files, fields, containers, and framework request lifecycles.
- Source, sink, and sanitizer modeling that records where validation, encoding, or authorization changes a path.
- Cross-repository modeling of services, entry points, and trust boundaries.
- Semantic deduplication of variants of the same defect, and exploit-chain analysis for combinations with higher impact than any single issue.
- Multiple review passes per candidate, checking the agent's claim against the graph and available deployment and configuration context. Candidates that cannot be substantiated are not reported.

### Business-logic invariants

Shannon Open Source focuses on injection, XSS, SSRF, and broken authentication and authorization. Enterprise adds testing for the bugs that do not fit a vulnerability class: it derives invariants the application is supposed to hold (tenant isolation, workflow ordering, approval limits, balance conservation, state transitions) and tests them against the running application. This is where application-specific vulnerabilities live and where pattern-based SAST often provides little or no signal.

### Proof by exploitation

The pentesting engine is a hardened fork of Shannon with the same rule: a pentest finding requires a working exploit. No exploit, no finding. Enterprise stores the exploit and replays it later to verify the fix.

SCA prioritizes vulnerable dependencies that application code actually reaches. Secrets scanning covers current source and repository history.

<p align="center">
  <img src="../assets/keygraph-platform/agentic-sast-results.png" alt="Keygraph Enterprise findings grouped into business-logic issues, point issues, and secrets" width="100%">
</p>

## Findings

Shannon Open Source hands you a report per scan. Enterprise dedupes across runs and across scanners, deterministically and semantically, into one record per vulnerability per repository. Each record carries evidence, source location, severity, scan history, status, owner, resolution, and last-verified state.

Workflows cover assignment, triage, false-positive and risk-acceptance decisions, and SLA policies with escalation and aging. Dashboards report open risk, coverage, new versus resolved, SLA compliance, and MTTR, exportable as evidence for customers and auditors.

Findings still require human review. Enterprise's extra review passes reduce weakly supported findings, but they do not eliminate them.

<p align="center">
  <img src="../assets/keygraph-platform/canonical-findings.png" alt="Keygraph Enterprise findings inventory with severity, status, source, and verification filters" width="100%">
</p>

### Fix and verify

From a finding, Keygraph generates a patch scoped to that finding and opens a pull request. It never commits to a protected branch.

<p align="center">
  <img src="../assets/keygraph-platform/automated-remediation.png" alt="Keygraph Enterprise remediation workflow for generating a fix and opening a pull request" width="100%">
</p>

Verification re-analyzes the changed code and, for pentest findings, replays the original exploit against the patched target. The verdict comes from deterministic checks plus a review pass, without rerunning the full scan.

<p align="center">
  <img src="../assets/keygraph-platform/targeted-verification.png" alt="Keygraph Enterprise finding-verification workflow" width="100%">
</p>

## Deployment and access control

Keygraph Enterprise deploys entirely inside your AWS, GCP, Azure, or on-prem environment, including networks with no internet egress. There is no Keygraph-operated control plane. Customer-hosted services and stored platform data remain inside your environment for the life of the deployment.

Model access is BYOK and BYOM. Route workloads to Anthropic, OpenAI, xAI, or Bedrock, a private cloud endpoint, your own gateway such as LiteLLM with your routing and policy applied, or local models on vLLM or Ollama. Model requests go directly to the endpoint you configure. Keygraph never receives or proxies them. A local model supports a fully disconnected deployment.

Access control: SAML/OIDC SSO, SCIM, roles with repository-scoped visibility (RBAC, plus attribute and relationship rules where needed), full audit log, scoped API keys.

<p align="center">
  <img src="../assets/keygraph-platform/enterprise-access-control.png" alt="Keygraph Enterprise roles and repository visibility controls" width="100%">
</p>

Keygraph maintains a SOC 2 Type II audit. The report is available to customers under NDA.

## Talk to Keygraph

Visit [keygraph.io](https://keygraph.io), book a [demo](https://cal.com/team/keygraph/shannon-pro), or email [shannon@keygraph.io](mailto:shannon@keygraph.io).
