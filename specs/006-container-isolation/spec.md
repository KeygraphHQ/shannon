# Feature Specification: Container Isolation for Scans

**Feature Branch**: `006-container-isolation`
**Created**: 2026-01-17
**Status**: Draft
**Input**: Architecture requirement for per-scan containerized sandbox with resource isolation and tenant separation

## Overview

This epic implements containerized sandbox isolation for security scan execution. Each scan runs in a dedicated, ephemeral container with strict resource limits, network isolation, and automatic cleanup. This architecture ensures:

- **Tenant isolation**: One customer's scan cannot access another customer's data or processes
- **Resource fairness**: No single scan can monopolize system resources
- **Security boundary**: Compromised scan targets cannot escape to host or other containers
- **Clean slate**: Each scan starts fresh without artifacts from previous executions

The container isolation layer sits between the Shannon service (Epic 005) and the actual scan execution, managed by Temporal workflows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Isolated Scan Execution (Priority: P1)

As the Shannon platform, I need each scan to execute in an isolated container so that scans from different tenants cannot interfere with each other and security testing cannot compromise the host system.

**Why this priority**: This is the core isolation requirement. Without container isolation, multi-tenant security testing is inherently risky - a malicious target could potentially access other tenants' data.

**Independent Test**: Start two scans for different organizations simultaneously, verify each runs in separate container with no shared resources, verify container cleanup after completion.

**Acceptance Scenarios**:

1. **Given** a scan request is received, **When** the Shannon service starts the scan, **Then** a new isolated container is spawned specifically for that scan with a unique container ID.

2. **Given** two concurrent scans from different organizations, **When** both are executing, **Then** each runs in a separate container with no shared memory, filesystem, or network namespace.

3. **Given** a scan is executing in a container, **When** I inspect the container's network, **Then** it can only reach the target URL and required external services (DNS, Temporal), not internal infrastructure or other containers.

4. **Given** a scan container attempts to access the host filesystem, **When** the access is attempted, **Then** the operation fails and is logged as a security event.

5. **Given** a scan completes (success or failure), **When** the workflow finishes, **Then** the container is terminated and all ephemeral storage is destroyed within 60 seconds.

---

### User Story 2 - Resource Limits and Fairness (Priority: P1)

As an operations engineer, I need scan containers to have enforced resource limits so that no single scan can degrade service for other tenants or crash the host system.

**Why this priority**: Resource limits are essential for multi-tenant SaaS stability. Without them, a scan against a large target could exhaust system memory or CPU, affecting all customers.

**Independent Test**: Start a scan with resource limits, trigger high resource usage, verify limits are enforced and scan is terminated if exceeded.

**Acceptance Scenarios**:

1. **Given** default resource limits are configured, **When** a container is spawned, **Then** it has enforced limits of 2 CPU cores and 4GB memory (configurable per plan).

2. **Given** a container exceeds memory limit, **When** memory usage crosses the threshold, **Then** the container is OOM-killed and the scan is marked as failed with error code `RESOURCE_LIMIT_EXCEEDED`.

3. **Given** a container exceeds CPU limit, **When** CPU usage is sustained above limit, **Then** the container is throttled (not killed) to stay within bounds.

4. **Given** different subscription plans, **When** scans are started, **Then** Free tier gets 1 CPU/2GB, Pro gets 2 CPU/4GB, Enterprise gets 4 CPU/8GB (configurable).

5. **Given** a container is running, **When** I query resource usage, **Then** I can see current CPU, memory, and network I/O for monitoring dashboards.

---

### User Story 3 - Network Isolation (Priority: P1)

As a security engineer, I need scan containers to have restricted network access so that they can only communicate with the scan target and required infrastructure services.

**Why this priority**: Network isolation prevents lateral movement if a scan target attempts to exploit the scanning agent. This is critical for defense-in-depth.

**Independent Test**: Deploy scan container, attempt to reach internal services and other containers, verify all such attempts are blocked while target URL remains accessible.

**Acceptance Scenarios**:

1. **Given** a scan container is running, **When** it attempts to reach the target URL, **Then** the connection succeeds.

2. **Given** a scan container is running, **When** it attempts to reach internal Kubernetes services, **Then** the connection is blocked by network policy.

3. **Given** a scan container is running, **When** it attempts to reach another scan container, **Then** the connection is blocked by network policy.

4. **Given** a scan container needs DNS resolution, **When** it queries DNS, **Then** it can resolve external hostnames but not internal service names.

5. **Given** network egress logging is enabled, **When** a container makes network connections, **Then** all egress is logged with destination IP, port, and bytes transferred.

6. **Given** a scan container, **When** it attempts to reach cloud metadata endpoints (169.254.169.254), **Then** the connection is blocked (SSRF protection).

---

### User Story 4 - Container Lifecycle Management (Priority: P2)

As the Shannon platform, I need automated container lifecycle management so that containers are properly provisioned, monitored, and cleaned up without manual intervention.

**Why this priority**: Proper lifecycle management prevents resource leaks, orphaned containers, and storage accumulation.

**Independent Test**: Start scan, verify container creation, let scan complete, verify container termination, verify no orphaned resources after 24 hours of operation.

**Acceptance Scenarios**:

1. **Given** a scan is queued, **When** a worker picks up the scan, **Then** a new container is created with the scan's configuration within 10 seconds.

2. **Given** a container has been running for longer than max duration (60 minutes default), **When** the timeout is reached, **Then** the container is forcefully terminated and scan marked as timed out.

3. **Given** a scan completes normally, **When** results are persisted, **Then** the container is terminated and removed from the runtime within 60 seconds.

4. **Given** a container crashes unexpectedly, **When** the crash is detected, **Then** the scan is marked as failed, container is cleaned up, and an alert is generated.

5. **Given** orphaned containers exist (no associated workflow), **When** the cleanup job runs (every 5 minutes), **Then** orphaned containers older than 10 minutes are terminated.

6. **Given** a scan is cancelled by user, **When** the cancellation signal is received, **Then** the container is sent SIGTERM, given 30 seconds for graceful shutdown, then SIGKILL if needed.

---

### User Story 5 - Ephemeral Storage Management (Priority: P2)

As the Shannon platform, I need scan containers to have isolated ephemeral storage that is destroyed after scan completion so that sensitive data from scans does not persist.

**Why this priority**: Scans may capture sensitive data from targets. Ephemeral storage ensures this data is destroyed and cannot be recovered by subsequent scans.

**Independent Test**: Run scan that writes to disk, verify writes succeed, verify data is inaccessible after container termination.

**Acceptance Scenarios**:

1. **Given** a container is created, **When** it starts, **Then** it has a dedicated ephemeral volume mounted at `/workspace` (10GB default).

2. **Given** a container's ephemeral storage, **When** the scan writes deliverables, **Then** deliverables are copied to persistent tenant storage before container termination.

3. **Given** a container has terminated, **When** the volume is inspected, **Then** the ephemeral volume is destroyed and data is unrecoverable.

4. **Given** multiple containers running, **When** they access their `/workspace`, **Then** each container can only access its own storage, not other containers' storage.

5. **Given** a container exceeds storage limit, **When** writes would exceed quota, **Then** write operations fail with ENOSPC and scan is marked as failed with `STORAGE_LIMIT_EXCEEDED`.

---

### User Story 6 - Container Image Management (Priority: P3)

As a DevOps engineer, I need scan container images to be versioned, secured, and automatically updated so that all scans use consistent, secure runtimes.

**Why this priority**: Consistent container images ensure reproducible scans and allow security patching without disrupting operations.

**Independent Test**: Deploy new image version, verify new scans use updated image, verify in-progress scans continue with previous version.

**Acceptance Scenarios**:

1. **Given** the scan container image, **When** it is built, **Then** it includes Shannon agent code, Playwright browser, security tools (nmap, subfinder, whatweb), and MCP server.

2. **Given** a new image version is pushed, **When** the deployment is updated, **Then** new scans use the new image while in-progress scans continue with their original image.

3. **Given** a container image, **When** it is scanned by vulnerability scanner, **Then** it contains no HIGH or CRITICAL CVEs in base image or installed packages.

4. **Given** image pull policy, **When** containers are spawned, **Then** images are pulled from private registry with authentication (not public Docker Hub).

5. **Given** an image version, **When** I query the image metadata, **Then** I can see build timestamp, git commit SHA, and included tool versions.

---

### Edge Cases

- **Container runtime unavailable**: If container runtime (Docker/containerd) is unavailable, scan requests are queued with exponential backoff retry. After 5 failures, scan is marked as failed with infrastructure error.

- **Image pull failure**: If scan image cannot be pulled (registry unavailable, auth failure), scan fails immediately with `IMAGE_PULL_FAILED` error code.

- **Zombie containers**: Containers without heartbeat for >5 minutes are considered zombies. Cleanup job terminates them and marks associated scans as failed.

- **Storage exhaustion**: If node storage is exhausted, new container creation fails. Alert is generated and existing containers continue operation.

- **Network policy enforcement failure**: If network policies cannot be applied, container creation fails. Scan never starts without network isolation.

- **Concurrent container limits**: Maximum 50 containers per node (configurable). Excess scans are queued at the service layer.

## Requirements *(mandatory)*

### Functional Requirements

**Container Isolation:**
- **FR-001**: System MUST spawn a dedicated container for each scan execution
- **FR-002**: System MUST ensure containers have isolated PID, network, mount, and user namespaces
- **FR-003**: System MUST prevent containers from accessing host filesystem except explicitly mounted paths
- **FR-004**: System MUST prevent containers from escalating privileges (no root, no capabilities)
- **FR-005**: System MUST terminate containers when associated scan completes or times out

**Resource Management:**
- **FR-010**: System MUST enforce CPU limits per container (configurable per plan)
- **FR-011**: System MUST enforce memory limits per container (configurable per plan)
- **FR-012**: System MUST enforce storage limits per container (configurable per plan)
- **FR-013**: System MUST track and expose resource usage metrics per container
- **FR-014**: System MUST terminate containers that exceed hard resource limits
- **FR-015**: System MUST implement resource quotas at tenant level (total resources across all running scans)

**Network Isolation:**
- **FR-020**: System MUST apply network policies restricting container egress to target URL and required services
- **FR-021**: System MUST block container access to internal Kubernetes services
- **FR-022**: System MUST block container access to other scan containers
- **FR-023**: System MUST block container access to cloud metadata endpoints (SSRF protection)
- **FR-024**: System MUST log all network egress for audit purposes
- **FR-025**: System MUST allow DNS resolution for external hostnames only

**Lifecycle Management:**
- **FR-030**: System MUST create containers within 10 seconds of scan start signal
- **FR-031**: System MUST terminate containers within 60 seconds of scan completion
- **FR-032**: System MUST forcefully terminate containers exceeding max scan duration
- **FR-033**: System MUST run cleanup job every 5 minutes to remove orphaned containers
- **FR-034**: System MUST handle graceful shutdown on cancellation (SIGTERM → wait → SIGKILL)
- **FR-035**: System MUST retry container creation on transient failures (max 3 attempts)

**Storage Management:**
- **FR-040**: System MUST provision ephemeral storage volume per container
- **FR-041**: System MUST copy deliverables to persistent storage before container termination
- **FR-042**: System MUST destroy ephemeral storage on container termination
- **FR-043**: System MUST enforce storage quotas per container
- **FR-044**: Storage paths MUST be tenant-prefixed (`tenant-{orgId}/scans/{scanId}/`)

**Image Management:**
- **FR-050**: System MUST use versioned container images from private registry
- **FR-051**: System MUST include all required tools in container image (Playwright, security tools, MCP)
- **FR-052**: System MUST scan images for vulnerabilities before deployment
- **FR-053**: System MUST support rolling image updates without disrupting in-progress scans

### Non-Functional Requirements

- **NFR-001**: Container startup time <10 seconds (warm cache), <30 seconds (cold pull)
- **NFR-002**: Container termination time <60 seconds under normal conditions
- **NFR-003**: System MUST support 50 concurrent containers per node minimum
- **NFR-004**: Resource overhead per container <100MB memory for container runtime
- **NFR-005**: Network policy enforcement latency <100ms
- **NFR-006**: 99.9% container creation success rate (excluding resource exhaustion)

### Key Entities

- **ScanContainer**: Runtime container executing a scan, with resource limits and lifecycle state

- **ContainerConfig**: Configuration for container creation including image, resources, network policy, and mounts

- **ResourceLimits**: CPU, memory, and storage limits for a container, derived from subscription plan

- **NetworkPolicy**: Rules governing container egress, including allowed destinations and blocked ranges

- **EphemeralVolume**: Temporary storage attached to container, destroyed on termination

- **ContainerMetrics**: Real-time resource usage (CPU, memory, network I/O) for monitoring

- **ContainerImage**: Versioned image reference with metadata (tag, digest, build info)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of scans execute in isolated containers (no shared-process execution)

- **SC-002**: Zero cross-tenant data access incidents (verified by security audit)

- **SC-003**: Container startup time <10 seconds for 95th percentile (warm cache)

- **SC-004**: Container cleanup completes within 60 seconds for 99th percentile

- **SC-005**: Zero orphaned containers older than 15 minutes (cleanup job effectiveness)

- **SC-006**: Resource limit enforcement verified by chaos testing (memory bomb, CPU burn)

- **SC-007**: Network isolation verified by penetration testing (no lateral movement)

- **SC-008**: Zero HIGH/CRITICAL CVEs in production container images (continuous scanning)

## Clarifications

*Questions to be answered during planning phase:*

- Q: Which container runtime - Docker, containerd, or Kubernetes pods?
  - Recommendation: Kubernetes pods with containerd runtime for production; Docker for local development

- Q: How should container images be distributed - private registry or OCI artifacts?
  - Recommendation: Private registry (Amazon ECR or Google Artifact Registry) with image signing

- Q: Should containers have internet egress or only reach targets via proxy?
  - Recommendation: Direct egress with network policy restrictions; proxy adds complexity without significant security benefit for scan scenarios

- Q: What happens if a scan needs more resources than plan allows?
  - Recommendation: Scan fails with clear error; upgrade prompt shown in UI

## Assumptions

1. **Kubernetes deployment**: Production deployment uses Kubernetes for container orchestration. Docker Compose for local development.

2. **Network policy support**: Kubernetes cluster has CNI supporting NetworkPolicy (Calico, Cilium, or similar).

3. **Container runtime security**: Runtime is hardened (seccomp, AppArmor/SELinux, no privileged containers).

4. **Private registry available**: Organization has private container registry for storing scan images.

5. **Storage provisioner**: Kubernetes cluster has CSI driver for ephemeral volume provisioning.

## Out of Scope

- GPU support for ML-based scanning (future consideration)
- Windows container support (Linux containers only)
- Serverless/FaaS execution model (AWS Lambda, Cloud Run)
- Custom container images per tenant (all tenants use same base image)
- Container image caching across nodes (rely on registry pull optimization)
