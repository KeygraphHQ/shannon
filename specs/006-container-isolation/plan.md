# Implementation Plan: Container Isolation for Scans

**Branch**: `006-container-isolation` | **Date**: 2026-01-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-container-isolation/spec.md`

## Summary

Implement containerized sandbox isolation for security scan execution. Each scan runs in a dedicated Kubernetes pod with strict resource limits (CPU/memory/storage), network isolation via Cilium FQDN-based policies, and automatic lifecycle management. The container isolation layer integrates with Temporal workflows to spawn isolated containers, monitor health via activity heartbeats, and cleanup resources on completion.

## Technical Context

**Language/Version**: TypeScript 5.x (ES Modules)
**Primary Dependencies**: @temporalio/*, @kubernetes/client-node, @anthropic-ai/claude-agent-sdk, @aws-sdk/client-s3
**Storage**: PostgreSQL (Prisma) for metadata, S3/GCS for deliverables via presigned URLs
**Testing**: Vitest for unit/integration, k8s kind cluster for container tests
**Target Platform**: Kubernetes cluster with Cilium CNI (production), Docker for local development
**Project Type**: Monorepo extension (shannon package)
**Performance Goals**: Container startup <10s (warm), <30s (cold), 50 concurrent containers per node
**Constraints**: <100MB runtime overhead per container, network policy latency <100ms
**Scale/Scope**: 50 concurrent scans per node, horizontal scaling via Kubernetes node pools

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Security-First ✅ PASS

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| OWASP Top 10 evaluation | Container isolation prevents XSS/injection escape; network policies block SSRF | ✅ |
| Secrets management | Kubernetes Secrets mounted as files/env vars (clarified) | ✅ |
| TLS/encryption | All Temporal and cloud storage communication uses TLS | ✅ |
| No secrets in code | API keys via K8s Secrets, registry auth via imagePullSecrets | ✅ |

### II. AI-Native Architecture ✅ PASS

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Claude Agent SDK primary framework | Scan execution uses Claude Agent SDK within containers | ✅ |
| Maximum autonomy within boundaries | Containers have full autonomy but network/resource constrained | ✅ |
| AI reasoning logged | Audit logs capture agent decisions within container | ✅ |
| LLM cost tracking | Tenant-scoped via existing metrics system | ✅ |

### III. Multi-Tenant Isolation ✅ PASS (Critical)

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Database scoped by organizationId | Container metadata queries scoped by orgId | ✅ |
| Temporal tenant namespaces | Workflows in tenant-specific task queues | ✅ |
| Worker pool isolation | Separate container per scan (no shared processes) | ✅ |
| Storage tenant-prefixed | `tenant-{orgId}/scans/{scanId}/` S3 paths | ✅ |
| Cross-tenant logged as security event | Network policy violations logged | ✅ |

### IV. Temporal-First Orchestration ✅ PASS

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Long-running ops as workflows | Container lifecycle managed by workflow activities | ✅ |
| Activity heartbeats | Scan activities emit heartbeats for zombie detection (clarified) | ✅ |
| Queryable workflow state | Container status queryable via Temporal | ✅ |
| Retry transient vs permanent | ContainerCreationError vs ResourceExhaustedError distinct | ✅ |
| Adapt existing workflow | Extends pentestPipelineWorkflow with container spawn step | ✅ |

### V. Progressive Delivery ✅ PASS

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| P1/P2/P3 prioritized stories | US1-US3 (P1), US4-US5 (P2), US6 (P3) defined | ✅ |
| MVP single story achievable | US1 (Isolated Scan Execution) delivers core value | ✅ |
| Independent acceptance criteria | Each story has Gherkin-style scenarios | ✅ |
| Feature flags for rollout | Container isolation can be enabled per-tenant | ✅ |

### VI. Observability-Driven ✅ PASS

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Structured JSON logging | Container events logged with correlation IDs | ✅ |
| Prometheus metrics | Container CPU/memory/network exposed as metrics | ✅ |
| Distributed tracing | OpenTelemetry spans from API → Temporal → Container | ✅ |
| Audit logs retained | Container lifecycle events retained 1+ year | ✅ |

### VII. Simplicity ✅ PASS

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| New abstractions justified | Kubernetes client abstraction needed for test/prod parity | ✅ |
| Managed services first | ECR/GCS for registry, S3 for storage, no self-hosted | ✅ |
| Focused tech stack | Kubernetes + Cilium (standard for container isolation) | ✅ |

**Gate Result**: ✅ ALL PRINCIPLES SATISFIED - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/006-container-isolation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # Internal API contracts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
shannon/
├── src/
│   ├── container/                    # NEW: Container isolation module
│   │   ├── index.ts                  # Module exports
│   │   ├── types.ts                  # ContainerConfig, ResourceLimits, etc.
│   │   ├── kubernetes-client.ts      # K8s API abstraction
│   │   ├── container-manager.ts      # Lifecycle: create, monitor, terminate
│   │   ├── network-policy.ts         # Cilium FQDN policy generation
│   │   ├── resource-limits.ts        # Plan-based resource allocation
│   │   ├── storage-manager.ts        # Ephemeral volume + S3 upload
│   │   └── cleanup-job.ts            # Orphaned container cleanup
│   ├── temporal/
│   │   ├── activities.ts             # Add container spawn/cleanup activities
│   │   └── workflows.ts              # Integrate container lifecycle
│   └── service/
│       └── routes/
│           └── scans.ts              # Pass container config to workflow
└── tests/
    ├── unit/
    │   └── container/                # Unit tests for container module
    └── integration/
        └── container/                # Kind cluster integration tests

docker/
├── scan-container/                   # NEW: Scan container image
│   ├── Dockerfile                    # Shannon agent + Playwright + tools
│   └── entrypoint.sh                 # Container startup script
└── docker-compose.yml                # Add container build target
```

**Structure Decision**: Extension to existing shannon package with new `container/` module. No new packages required - follows existing monorepo pattern.

## Complexity Tracking

> No violations requiring justification. All patterns use standard Kubernetes abstractions.

| Component | Complexity Level | Justification |
|-----------|-----------------|---------------|
| Kubernetes client abstraction | Medium | Required for test/prod parity (Docker local, K8s prod) |
| Cilium FQDN policies | Low | Standard Cilium feature, no custom code |
| S3 presigned URLs | Low | AWS SDK standard pattern |
