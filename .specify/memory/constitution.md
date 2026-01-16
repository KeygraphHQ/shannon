<!--
Sync Impact Report
==================
Version change: 0.0.0 → 1.0.0
Type: MAJOR (Initial constitution creation)

Modified principles: N/A (initial version)

Added sections:
- 7 Core Principles (Security-First, AI-Native, Multi-Tenant Isolation, Temporal-First Orchestration, Progressive Delivery, Observability-Driven, Simplicity)
- Security & Compliance Requirements section
- Quality Gates & Development Workflow section
- Governance section

Removed sections: N/A (initial version)

Templates requiring updates:
- ✅ .specify/templates/plan-template.md - No updates required (Constitution Check placeholder present)
- ✅ .specify/templates/spec-template.md - No updates required (compatible with progressive delivery)
- ✅ .specify/templates/tasks-template.md - No updates required (user story independence aligns)

Follow-up TODOs: None
-->

# Shannon SaaS Constitution

## Core Principles

### I. Security-First

All features, designs, and implementations MUST prioritize security as a non-negotiable constraint. This principle is paramount given Shannon's role as a security testing platform.

- Every code change MUST be evaluated for potential security vulnerabilities (OWASP Top 10, CWE Top 25)
- Authentication and authorization MUST use industry-standard patterns (OAuth 2.0, JWT, RBAC)
- Secrets MUST never be stored in code; use environment variables or secrets managers
- All network communication MUST use TLS 1.3; data at rest MUST use AES-256 encryption
- Security incidents MUST be treated as P0 priorities regardless of other work
- The platform testing its own security (self-pentesting) is encouraged and expected

**Rationale:** A penetration testing SaaS that is itself insecure would be an existential risk to the business and customers.

### II. AI-Native Architecture

Shannon leverages autonomous AI agents as the core execution engine. All architectural decisions MUST preserve and enhance AI capabilities.

- The Claude Agent SDK is the primary execution framework for security testing workflows
- AI agents MUST operate with maximum autonomy within defined security boundaries
- Human-in-the-loop is optional for scan execution but MUST be available for sensitive operations
- AI reasoning and decision paths MUST be logged for auditability and debugging
- LLM API failures MUST be handled gracefully with retry logic and fallback strategies
- Cost tracking for LLM usage MUST be implemented at the tenant level

**Rationale:** AI-powered analysis is Shannon's core differentiator from traditional SAST/DAST tools.

### III. Multi-Tenant Isolation

Every tenant's data, workflows, and resources MUST be completely isolated from other tenants. This is a critical security and compliance requirement.

- All database queries MUST be scoped by `organizationId` using row-level security
- Temporal workflows MUST run in tenant-specific namespaces (`tenant-{id}`)
- Worker pools MUST maintain isolation (separate Chromium instances per tenant)
- Storage objects MUST be prefixed with `tenant-{id}/` for S3/blob storage
- Cross-tenant access attempts MUST be logged as security events
- Integration and E2E tests MUST verify tenant isolation

**Rationale:** Data leakage between tenants would be a critical security failure and compliance violation.

### IV. Temporal-First Orchestration

Shannon MUST use Temporal for all workflow orchestration. The existing Temporal infrastructure is a proven asset that MUST be preserved and extended.

- All long-running operations MUST be implemented as Temporal workflows
- Activities MUST implement heartbeats for crash recovery
- Workflow state MUST be queryable for real-time progress tracking
- Retry policies MUST distinguish between transient and permanent errors
- The existing pentest pipeline workflow MUST be adapted, not rewritten
- Temporal Cloud SHOULD be used for production deployments (managed scaling)

**Rationale:** Temporal provides crash recovery, durability, and observability that are critical for reliable pentest execution.

### V. Progressive Delivery

Features MUST be delivered incrementally with independently testable user stories. Each delivery increment MUST provide standalone value.

- User stories MUST be prioritized (P1, P2, P3) and independently implementable
- MVP MUST be achievable with a single high-priority user story
- Each user story MUST have defined acceptance criteria and independent tests
- Feature flags SHOULD be used for gradual rollouts to limit blast radius
- Backward compatibility MUST be maintained unless explicitly breaking (major version)
- The roadmap (MVP → Growth → Enterprise) defines the delivery sequence

**Rationale:** Progressive delivery reduces risk, enables faster feedback, and allows course correction based on user needs.

### VI. Observability-Driven Operations

The system MUST be observable from day one. Operations without observability are blind operations.

- Structured logging (JSON) MUST be used for all components
- Metrics (Prometheus/Grafana) MUST track: API latency, error rates, scan throughput
- Distributed tracing (OpenTelemetry) MUST span API → Temporal → Workers
- Alerting MUST be configured for critical errors and SLA violations
- Dashboards MUST provide real-time visibility into system health
- Audit logs MUST capture all security-relevant events (retained 1+ year)

**Rationale:** A SaaS platform serving paying customers MUST be observable to maintain reliability and debug production issues.

### VII. Simplicity Over Complexity

Start simple. Avoid over-engineering. YAGNI (You Aren't Gonna Need It) applies.

- New abstractions MUST be justified by concrete, immediate needs
- Infrastructure choices MUST start with managed services before self-hosting
- The technology stack MUST remain focused (avoid unnecessary diversification)
- Documentation MUST be concise and actionable, not exhaustive
- If a simpler solution works, use it; complexity can be added later
- On-premise deployment is deferred until Enterprise customers require it

**Rationale:** Complexity is the enemy of velocity. A startup must ship fast while maintaining quality.

## Security & Compliance Requirements

Given Shannon's nature as a security testing platform, these requirements are elevated to constitutional status:

**Data Protection:**
- PCI-DSS compliance for billing (achieved via Stripe hosted checkout)
- GDPR compliance for user data (right to access, deletion, portability)
- SOC2 Type II certification as a Year 1 goal
- Penetration testing of the platform itself (annual external audit)

**Operational Security:**
- Secrets rotation every 90 days (automated via Secrets Manager)
- Rate limiting per tenant, per API key, and per IP
- DDoS protection via CDN (CloudFlare recommended)
- Vulnerability scanning in CI/CD (Snyk for dependencies, Trivy for containers)

**Incident Response:**
- Security incidents MUST have a defined response playbook
- RTO (Recovery Time Objective): <1 hour
- RPO (Recovery Point Objective): <15 minutes
- Post-incident reviews MUST be conducted within 48 hours

## Quality Gates & Development Workflow

All code changes MUST pass through defined quality gates:

**Pre-Merge Gates:**
- Code review by at least one other engineer
- All existing tests MUST pass
- No new lint errors or warnings
- Security scan (Snyk/Trivy) MUST not introduce new vulnerabilities
- TypeScript strict mode MUST be maintained

**Pre-Release Gates:**
- Integration tests MUST pass in staging environment
- Performance benchmarks MUST not regress >10%
- Documentation MUST be updated for user-facing changes
- Release notes MUST be prepared for significant features

**Development Practices:**
- Test-Driven Development (TDD) is RECOMMENDED for new features
- Feature branches MUST be rebased on main before merge
- Commits MUST follow conventional commit format
- PR descriptions MUST link to relevant specs/tasks

## Governance

This constitution supersedes all other development practices and guidelines. It represents the non-negotiable constraints for Shannon SaaS development.

**Amendment Process:**
1. Propose amendment with rationale in writing
2. Review by technical leadership (minimum 48-hour review period)
3. Update version number following semantic versioning:
   - MAJOR: Principle removal or fundamental redefinition
   - MINOR: New principle or section added
   - PATCH: Clarifications, wording improvements
4. Propagate changes to dependent templates and documentation
5. Communicate changes to all contributors

**Compliance Verification:**
- All PRs MUST include a constitution compliance check
- Architecture decisions MUST reference relevant principles
- Regular audits (quarterly) SHOULD verify adherence to principles
- Violations MUST be escalated and remediated promptly

**Living Document:**
- This constitution evolves with the product
- Feedback and improvement suggestions are welcome
- Context and rationale MUST be preserved for future understanding

**Version**: 1.0.0 | **Ratified**: 2026-01-16 | **Last Amended**: 2026-01-16
