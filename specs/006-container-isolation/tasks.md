# Tasks: Container Isolation for Scans

**Input**: Design documents from `/specs/006-container-isolation/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/api.md ✓

**Tests**: Tests are included for critical integration points. Unit tests are optional.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
- **Container module**: `shannon/src/container/`
- **Temporal integration**: `shannon/src/temporal/`
- **Service integration**: `shannon/src/service/`
- **Container image**: `docker/scan-container/`
- **Tests**: `shannon/tests/unit/container/`, `shannon/tests/integration/container/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and basic module structure

- [x] T001 Install @kubernetes/client-node dependency in shannon/package.json
- [x] T002 [P] Install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner in shannon/package.json
- [x] T003 Create container module directory structure at shannon/src/container/
- [x] T004 [P] Create container module index.ts with module exports in shannon/src/container/index.ts
- [x] T005 [P] Add container environment variables to .env.example (K8S_NAMESPACE, SCANNER_IMAGE, S3_BUCKET)
- [x] T006 Create test directory structure at shannon/tests/unit/container/ and shannon/tests/integration/container/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Define container TypeScript types and interfaces in shannon/src/container/types.ts per contracts/api.md
- [x] T008 Define ContainerStatus enum matching data-model.md in shannon/src/container/types.ts
- [x] T009 Define ContainerActivityError type with error codes in shannon/src/container/types.ts
- [x] T010 Implement KubernetesClient wrapper for @kubernetes/client-node in shannon/src/container/kubernetes-client.ts
- [x] T011 Add KubernetesClient authentication (loadFromDefault for in-cluster) in shannon/src/container/kubernetes-client.ts
- [x] T012 Add Prisma schema for ScanContainer model in ghostshell/prisma/schema.prisma per data-model.md
- [x] T013 Add Prisma schema for ContainerConfig model in ghostshell/prisma/schema.prisma
- [x] T014 Run Prisma migration for container isolation tables: `cd ghostshell && npx prisma migrate dev --name add_container_isolation`
- [x] T015 [P] Create ResourceLimits plan defaults (free/pro/enterprise) in shannon/src/container/resource-limits.ts
- [x] T016 [P] Implement getPlanLimits() function in shannon/src/container/resource-limits.ts
- [x] T017 Implement toK8sResourceLimits() converter in shannon/src/container/resource-limits.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Isolated Scan Execution (Priority: P1) 🎯 MVP

**Goal**: Each scan executes in a dedicated, isolated Kubernetes pod with unique container ID

**Independent Test**: Start two scans for different organizations simultaneously, verify each runs in separate container with no shared resources, verify container cleanup after completion.

### Implementation for User Story 1

- [x] T018 [US1] Implement buildPodSpec() to generate K8s Pod manifest in shannon/src/container/container-manager.ts
- [x] T019 [US1] Add pod security context (runAsNonRoot, seccompProfile) in shannon/src/container/container-manager.ts
- [x] T020 [US1] Add pod labels (scan-id, org-id, managed-by) in shannon/src/container/container-manager.ts
- [x] T021 [US1] Implement ContainerManager.create() to create K8s pod via KubernetesClient in shannon/src/container/container-manager.ts
- [x] T022 [US1] Implement ContainerManager.getStatus() to query pod phase in shannon/src/container/container-manager.ts
- [x] T023 [US1] Implement ContainerManager.watch() with K8s watch API in shannon/src/container/container-manager.ts
- [x] T024 [US1] Implement ContainerManager.terminate() with graceful shutdown in shannon/src/container/container-manager.ts
- [x] T025 [US1] Implement createScanContainer Temporal activity in shannon/src/temporal/activities.ts
- [x] T026 [US1] Add error handling for CONTAINER_CREATION_FAILED in createScanContainer activity
- [x] T027 [US1] Implement terminateScanContainer Temporal activity in shannon/src/temporal/activities.ts
- [x] T028 [US1] Integrate container lifecycle into pentestPipelineWorkflow in shannon/src/temporal/workflows.ts
- [x] T029 [US1] Add container spawn before scan execution in workflow
- [x] T030 [US1] Add container termination after scan completion/failure in workflow
- [x] T031 [US1] Update scan service to pass container config to workflow in shannon/src/service/routes/scans.ts

**Checkpoint**: At this point, User Story 1 should be fully functional - scans execute in isolated containers

---

## Phase 4: User Story 2 - Resource Limits and Fairness (Priority: P1)

**Goal**: Containers have enforced CPU, memory, and storage limits based on subscription plan

**Independent Test**: Start a scan with resource limits, trigger high resource usage, verify limits are enforced and scan is terminated if exceeded.

### Implementation for User Story 2

- [ ] T032 [US2] Add resource limits to pod spec in buildPodSpec() in shannon/src/container/container-manager.ts
- [ ] T033 [US2] Implement plan-based resource allocation lookup in shannon/src/container/container-manager.ts
- [ ] T034 [US2] Add RESOURCE_QUOTA_EXCEEDED error handling in createScanContainer activity
- [ ] T035 [US2] Add Prisma schema for ResourceLimits model in ghostshell/prisma/schema.prisma
- [ ] T036 [US2] Seed default resource limits (free/pro/enterprise) in Prisma seed
- [ ] T037 [US2] Implement ContainerManager.listByOrganization() for concurrent count check in shannon/src/container/container-manager.ts
- [ ] T038 [US2] Add concurrent container limit validation before creation in shannon/src/container/container-manager.ts
- [ ] T039 [US2] Implement container metrics collection in shannon/src/container/container-manager.ts
- [ ] T040 [US2] Add Prisma schema for ContainerMetrics model in ghostshell/prisma/schema.prisma
- [ ] T041 [US2] Implement metrics persistence to database in shannon/src/container/container-manager.ts
- [ ] T042 [US2] Handle OOM-killed containers with RESOURCE_LIMIT_EXCEEDED status in shannon/src/container/container-manager.ts

**Checkpoint**: At this point, resource limits are enforced per subscription plan

---

## Phase 5: User Story 3 - Network Isolation (Priority: P1)

**Goal**: Containers have FQDN-based network policies restricting egress to target URL and required services only

**Independent Test**: Deploy scan container, attempt to reach internal services and other containers, verify all such attempts are blocked while target URL remains accessible.

### Implementation for User Story 3

- [ ] T043 [US3] Implement NetworkPolicyManager interface in shannon/src/container/network-policy.ts
- [ ] T044 [US3] Implement buildCiliumNetworkPolicy() to generate CiliumNetworkPolicy manifest in shannon/src/container/network-policy.ts
- [ ] T045 [US3] Add DNS egress rule to policy (required for FQDN resolution) in shannon/src/container/network-policy.ts
- [ ] T046 [US3] Add target hostname FQDN egress rule to policy in shannon/src/container/network-policy.ts
- [ ] T047 [US3] Add Temporal server egress rule to policy in shannon/src/container/network-policy.ts
- [ ] T048 [US3] Add cloud storage (S3/GCS) egress rule to policy in shannon/src/container/network-policy.ts
- [ ] T049 [US3] Add Anthropic API egress rule to policy in shannon/src/container/network-policy.ts
- [ ] T050 [US3] Add SSRF protection (block 169.254.0.0/16 metadata) in shannon/src/container/network-policy.ts
- [ ] T051 [US3] Implement NetworkPolicyManager.create() to apply policy via KubernetesClient in shannon/src/container/network-policy.ts
- [ ] T052 [US3] Implement NetworkPolicyManager.delete() to remove policy on cleanup in shannon/src/container/network-policy.ts
- [ ] T053 [US3] Add Prisma schema for NetworkPolicy model in ghostshell/prisma/schema.prisma
- [ ] T054 [US3] Integrate network policy creation into ContainerManager.create() in shannon/src/container/container-manager.ts
- [ ] T055 [US3] Add NETWORK_POLICY_FAILED error handling in createScanContainer activity
- [ ] T056 [US3] Integrate network policy deletion into ContainerManager.terminate() in shannon/src/container/container-manager.ts

**Checkpoint**: At this point, network isolation is enforced via Cilium FQDN policies

---

## Phase 6: User Story 4 - Container Lifecycle Management (Priority: P2)

**Goal**: Automated container provisioning, monitoring, timeout handling, and cleanup without manual intervention

**Independent Test**: Start scan, verify container creation within 10s, let scan complete, verify container termination within 60s, verify no orphaned resources after 24 hours.

### Implementation for User Story 4

- [ ] T057 [US4] Implement monitorContainerHealth Temporal activity with heartbeats in shannon/src/temporal/activities.ts
- [ ] T058 [US4] Add heartbeat emission during container monitoring (60s interval) in shannon/src/temporal/activities.ts
- [ ] T059 [US4] Implement container timeout detection (60 minute default) in monitorContainerHealth activity
- [ ] T060 [US4] Add TERMINATED status handling for timeout in shannon/src/container/container-manager.ts
- [ ] T061 [US4] Implement cleanup job for orphaned containers in shannon/src/container/cleanup-job.ts
- [ ] T062 [US4] Add orphan detection query (containers without workflow heartbeat >5min) in shannon/src/container/cleanup-job.ts
- [ ] T063 [US4] Implement ContainerManager.cleanupOrphaned() in shannon/src/container/container-manager.ts
- [ ] T064 [US4] Add cleanup job scheduling (every 5 minutes) in shannon/src/container/cleanup-job.ts
- [ ] T065 [US4] Handle graceful shutdown on cancellation (SIGTERM → 30s → SIGKILL) in shannon/src/container/container-manager.ts
- [ ] T066 [US4] Add crash detection and alert generation in monitorContainerHealth activity
- [ ] T067 [US4] Implement container creation retry logic (max 3 attempts) in createScanContainer activity

**Checkpoint**: At this point, container lifecycle is fully automated with cleanup

---

## Phase 7: User Story 5 - Ephemeral Storage Management (Priority: P2)

**Goal**: Isolated ephemeral storage per container, deliverables uploaded to S3 via presigned URLs, storage destroyed on termination

**Independent Test**: Run scan that writes to disk, verify writes succeed, verify data uploaded to S3, verify data inaccessible after container termination.

### Implementation for User Story 5

- [ ] T068 [US5] Implement StorageManager interface in shannon/src/container/storage-manager.ts
- [ ] T069 [US5] Add emptyDir volume to pod spec with size limit in shannon/src/container/container-manager.ts
- [ ] T070 [US5] Implement S3 presigned URL generation in shannon/src/container/storage-manager.ts
- [ ] T071 [US5] Add tenant-prefixed S3 paths (tenant-{orgId}/scans/{scanId}/) in shannon/src/container/storage-manager.ts
- [ ] T072 [US5] Implement uploadDeliverables Temporal activity in shannon/src/temporal/activities.ts
- [ ] T073 [US5] Pass presigned URL to container via environment variable in shannon/src/container/container-manager.ts
- [ ] T074 [US5] Add Prisma schema for EphemeralVolume model in ghostshell/prisma/schema.prisma
- [ ] T075 [US5] Implement volume destruction tracking in ContainerManager.terminate() in shannon/src/container/container-manager.ts
- [ ] T076 [US5] Add STORAGE_LIMIT_EXCEEDED error handling in shannon/src/container/container-manager.ts
- [ ] T077 [US5] Integrate deliverable upload before container termination in workflow in shannon/src/temporal/workflows.ts

**Checkpoint**: At this point, ephemeral storage is isolated and deliverables persist to S3

---

## Phase 8: User Story 6 - Container Image Management (Priority: P3)

**Goal**: Versioned, secured container images with vulnerability scanning and rolling updates

**Independent Test**: Deploy new image version, verify new scans use updated image, verify in-progress scans continue with previous version.

### Implementation for User Story 6

- [ ] T078 [US6] Create scan container Dockerfile at docker/scan-container/Dockerfile
- [ ] T079 [US6] Add entrypoint script at docker/scan-container/entrypoint.sh
- [ ] T080 [US6] Include Shannon agent code in container image
- [ ] T081 [US6] Include Playwright and Chromium in container image
- [ ] T082 [US6] Include security tools (nmap, subfinder, whatweb) in container image
- [ ] T083 [US6] Add non-root user configuration in Dockerfile
- [ ] T084 [US6] Add Prisma schema for ContainerImage model in ghostshell/prisma/schema.prisma
- [ ] T085 [US6] Implement image version lookup in ContainerManager.create() in shannon/src/container/container-manager.ts
- [ ] T086 [US6] Add image digest pinning support in buildPodSpec() in shannon/src/container/container-manager.ts
- [ ] T087 [US6] Add imagePullSecrets for private registry in buildPodSpec() in shannon/src/container/container-manager.ts
- [ ] T088 [US6] Add docker-compose.yml target for building scan container image
- [ ] T089 [US6] Document image build and push process in quickstart.md

**Checkpoint**: At this point, container images are versioned and secured

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Integration, documentation, and validation

- [ ] T090 [P] Add structured logging for container events in shannon/src/container/container-manager.ts
- [ ] T091 [P] Add correlation ID propagation to container logs
- [ ] T092 [P] Export container metrics to Prometheus in shannon/src/container/container-manager.ts
- [ ] T093 Create Kind cluster configuration at docker/kind-config.yaml per quickstart.md
- [ ] T094 [P] Create Kubernetes manifests for RBAC (ServiceAccount, Role, RoleBinding) at docker/k8s/rbac.yaml
- [ ] T095 [P] Create Kubernetes manifests for Secrets at docker/k8s/secrets.yaml.example
- [ ] T096 Add integration test for container creation in shannon/tests/integration/container/create.test.ts
- [ ] T097 Add integration test for network isolation in shannon/tests/integration/container/network.test.ts
- [ ] T098 Add integration test for cleanup job in shannon/tests/integration/container/cleanup.test.ts
- [ ] T099 Run quickstart.md validation to verify local development setup
- [ ] T100 Update CLAUDE.md with container isolation documentation

### NFR Validation

- [ ] T101 [NFR-004] Add runtime overhead measurement test (<100MB per container) in shannon/tests/integration/container/overhead.test.ts
- [ ] T102 [NFR-005] Add network policy latency test (<100ms enforcement) in shannon/tests/integration/container/network.test.ts
- [ ] T103 [NFR-006] Implement container creation success rate tracking in shannon/src/container/metrics.ts

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ─────────────────────────────────────────────────┐
                                                                  │
Phase 2 (Foundational) ──────────────────────────────────────────┤
                                                                  │ BLOCKS
    ┌─────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────┬───────────────┬───────────────┐
│ Phase 3 (US1) │ Phase 4 (US2) │ Phase 5 (US3) │  ← Can run in parallel
│   MVP 🎯      │               │               │    (P1 stories)
└───────┬───────┴───────┬───────┴───────┬───────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
    ┌───────────────────┴───────────────────┐
    │                                       │
    ▼                                       ▼
┌───────────────┐               ┌───────────────┐
│ Phase 6 (US4) │               │ Phase 7 (US5) │  ← Can run in parallel
│               │               │               │    (P2 stories)
└───────────────┘               └───────────────┘
        │                               │
        └───────────────┬───────────────┘
                        │
                        ▼
                ┌───────────────┐
                │ Phase 8 (US6) │  ← P3 story
                └───────────────┘
                        │
                        ▼
                ┌───────────────┐
                │ Phase 9       │  ← Polish
                │ (Polish)      │
                └───────────────┘
```

### User Story Dependencies

| Story | Depends On | Independent Test |
|-------|------------|------------------|
| US1 (P1) | Foundational | ✓ Two concurrent scans in separate containers |
| US2 (P1) | Foundational | ✓ Resource limit enforcement |
| US3 (P1) | Foundational | ✓ Network blocking verification |
| US4 (P2) | US1 | ✓ Timeout and cleanup automation |
| US5 (P2) | US1 | ✓ S3 upload and storage destruction |
| US6 (P3) | US1 | ✓ Image versioning and updates |

### Within Each User Story

1. Types/interfaces before implementations
2. Core container operations before Temporal activities
3. Temporal activities before workflow integration
4. Database models as needed per story

### Parallel Opportunities

**Phase 2 (Foundational)**:
- T015, T016 (resource limits) can run parallel to T010, T011 (K8s client)
- T012, T013 (Prisma models) can run parallel to TypeScript types

**Phase 3-5 (P1 Stories)**:
- US1, US2, US3 can be worked on by different developers after Phase 2

**Phase 6-7 (P2 Stories)**:
- US4 and US5 can be worked on in parallel after US1 is complete

**Phase 9 (Polish)**:
- All [P] marked tasks can run in parallel

---

## Parallel Example: User Story 1

```bash
# After Phase 2, launch US1 container manager tasks:
Task: "T018 [US1] Implement buildPodSpec() in shannon/src/container/container-manager.ts"
Task: "T019 [US1] Add pod security context in shannon/src/container/container-manager.ts"
Task: "T020 [US1] Add pod labels in shannon/src/container/container-manager.ts"

# These three can run in parallel as they modify different sections of the same file
# but require coordination on the final integration
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T017)
3. Complete Phase 3: User Story 1 (T018-T031)
4. **STOP and VALIDATE**: Test container isolation independently
5. Deploy/demo if ready - scans now run in isolated containers

### Incremental Delivery

| Milestone | Stories Included | Value Delivered |
|-----------|------------------|-----------------|
| MVP | US1 | Scans run in isolated containers |
| v1.1 | US1 + US2 | Resource limits enforced |
| v1.2 | US1 + US2 + US3 | Full network isolation |
| v2.0 | All P1 + US4 | Automated lifecycle management |
| v2.1 | All P1/P2 + US5 | Ephemeral storage with S3 |
| v3.0 | All stories | Versioned container images |

### Parallel Team Strategy

With multiple developers:

1. **Together**: Complete Setup + Foundational (Phase 1-2)
2. **Parallel**:
   - Developer A: User Story 1 (core isolation)
   - Developer B: User Story 2 (resource limits)
   - Developer C: User Story 3 (network policies)
3. **Integration**: Merge P1 stories, then continue with P2

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US1 is the MVP - delivers core container isolation value
- US2 and US3 are also P1 but can be deferred if time-constrained
