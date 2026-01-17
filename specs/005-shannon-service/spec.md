# Feature Specification: Shannon Service Architecture

**Feature Branch**: `005-shannon-service`
**Created**: 2026-01-17
**Status**: Draft
**Input**: Architecture requirement to transform Shannon core into a standalone service consumable by the web application

## Overview

This epic transforms the existing Shannon penetration testing engine (currently in `/src/`) into a standalone service with well-defined API contracts. The service will be consumed by the Shannon SaaS web application to execute security scans, while maintaining the ability to run independently for CLI usage and future integrations.

The transformation enables:
- Clear separation between web UI and scan execution
- Independent scaling of web tier and scan workers
- API-first design for future integrations (CLI, SDK, third-party)
- Improved testability and deployment flexibility

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Internal Service Communication (Priority: P1)

As the Shannon web application, I need to communicate with the Shannon scan service via a well-defined API so that I can trigger scans, monitor progress, and retrieve results without tight coupling to the scan execution implementation.

**Why this priority**: This is the foundational requirement that enables the entire service transformation. Without a defined API contract, the web application cannot consume the service.

**Independent Test**: Web application calls service API to start a scan, receives workflow ID, polls for progress, retrieves completed results - all without direct Temporal client access.

**Acceptance Scenarios**:

1. **Given** the Shannon service is running, **When** the web app sends a POST to `/api/v1/scans` with target URL and config, **Then** the service returns a scan ID and workflow reference within 2 seconds.

2. **Given** a scan is in progress, **When** the web app sends a GET to `/api/v1/scans/{scanId}/progress`, **Then** the service returns current phase, percentage, agent status, and ETA.

3. **Given** a scan has completed, **When** the web app sends a GET to `/api/v1/scans/{scanId}/results`, **Then** the service returns findings, metrics, and report paths.

4. **Given** a scan is running, **When** the web app sends a DELETE to `/api/v1/scans/{scanId}`, **Then** the scan is cancelled gracefully with partial results preserved.

5. **Given** the service receives a request without valid authentication, **When** the request is processed, **Then** the service returns 401 Unauthorized without executing any scan logic.

---

### User Story 2 - Service Health and Discovery (Priority: P1)

As an operations engineer, I need the Shannon service to expose health endpoints and service metadata so that I can monitor service availability, configure load balancers, and integrate with service discovery.

**Why this priority**: Health checks are essential for production deployments and container orchestration. Without them, Kubernetes cannot properly manage service lifecycle.

**Independent Test**: Health endpoint returns 200 when service is healthy, includes dependency status (Temporal, database), returns 503 when critical dependencies are unavailable.

**Acceptance Scenarios**:

1. **Given** the Shannon service is running with all dependencies available, **When** a client sends GET to `/health`, **Then** the service returns 200 with `{"status": "healthy", "dependencies": {...}}`.

2. **Given** the Temporal server is unavailable, **When** a client sends GET to `/health`, **Then** the service returns 503 with `{"status": "unhealthy", "dependencies": {"temporal": "unavailable"}}`.

3. **Given** the service is starting up, **When** a client sends GET to `/health/ready`, **Then** the service returns 503 until all initialization is complete, then 200.

4. **Given** the service needs to provide metrics, **When** a client sends GET to `/metrics`, **Then** the service returns Prometheus-format metrics including scan counts, durations, and error rates.

5. **Given** the service exposes version info, **When** a client sends GET to `/api/v1/info`, **Then** the service returns version, build time, and supported API versions.

---

### User Story 3 - Authentication Validation Service (Priority: P2)

As the Shannon web application, I need to validate user-provided authentication credentials before starting a scan so that I can provide immediate feedback on configuration errors.

**Why this priority**: Authentication validation is a discrete capability that can be exposed as a service endpoint, enabling the web UI to test credentials before committing to a full scan.

**Independent Test**: Send credentials to validation endpoint, receive pass/fail with specific error details, without triggering a full scan workflow.

**Acceptance Scenarios**:

1. **Given** valid form-based auth credentials, **When** the web app calls POST `/api/v1/auth/validate`, **Then** the service returns `{"valid": true, "validatedAt": "..."}` within 30 seconds.

2. **Given** invalid credentials, **When** the web app calls POST `/api/v1/auth/validate`, **Then** the service returns `{"valid": false, "error": "Login failed: invalid password", "errorCode": "AUTH_INVALID_CREDENTIALS"}`.

3. **Given** a target URL that is unreachable, **When** the web app calls POST `/api/v1/auth/validate`, **Then** the service returns `{"valid": false, "error": "Target unreachable", "errorCode": "AUTH_TARGET_UNREACHABLE"}`.

4. **Given** TOTP-enabled authentication, **When** the web app provides a TOTP secret, **Then** the service generates a valid code and uses it for validation.

---

### User Story 4 - Scan Configuration Templates (Priority: P3)

As the Shannon web application, I need to retrieve default scan configurations and supported options so that I can present configuration UI without hardcoding values.

**Why this priority**: Configuration discovery enables the web UI to dynamically adapt to service capabilities and present accurate options to users.

**Independent Test**: Retrieve supported authentication methods, scan phases, and default timeouts from service API.

**Acceptance Scenarios**:

1. **Given** the service supports multiple auth methods, **When** the web app calls GET `/api/v1/config/auth-methods`, **Then** the service returns list of supported methods with their required fields.

2. **Given** the service has configurable scan parameters, **When** the web app calls GET `/api/v1/config/scan-options`, **Then** the service returns available options, defaults, and valid ranges.

3. **Given** the service supports multiple scan phases, **When** the web app calls GET `/api/v1/config/phases`, **Then** the service returns phase names, descriptions, and default enabled states.

---

### User Story 5 - Async Report Generation (Priority: P3)

As the Shannon web application, I need to request report generation asynchronously so that I can handle large scans without blocking the user interface.

**Why this priority**: Report generation for large scans can take significant time. Async generation enables better UX and resource management.

**Independent Test**: Request report generation, receive job ID, poll for completion, download generated report.

**Acceptance Scenarios**:

1. **Given** a completed scan, **When** the web app calls POST `/api/v1/scans/{scanId}/reports` with template selection, **Then** the service returns a report job ID and starts async generation.

2. **Given** report generation is in progress, **When** the web app calls GET `/api/v1/reports/{jobId}/status`, **Then** the service returns progress percentage and estimated completion.

3. **Given** report generation has completed, **When** the web app calls GET `/api/v1/reports/{jobId}/download`, **Then** the service returns the generated report file.

---

### Edge Cases

- **Service unavailable during scan**: If the service crashes mid-scan, Temporal workflow continues. On service restart, progress can be queried for all active workflows.

- **Concurrent request limits**: Service enforces per-tenant limits on concurrent scan requests (default: 3). Excess requests return 429 Too Many Requests with retry-after header.

- **Large payload handling**: Scan results with many findings are paginated. Results endpoint supports cursor-based pagination for findings.

- **API versioning**: All endpoints are versioned (`/api/v1/`). Breaking changes require new version. Old versions supported for 6 months minimum.

- **Rate limiting**: Service implements rate limiting per API key (1000 requests/hour default). Rate limit headers included in all responses.

- **Request timeout**: Long-running validation requests timeout after 60 seconds. Client receives 504 Gateway Timeout with instructions to retry.

## Requirements *(mandatory)*

### Functional Requirements

**Service Core:**
- **FR-001**: Service MUST expose REST API at `/api/v1/` for all scan operations
- **FR-002**: Service MUST authenticate all API requests using API keys or JWT tokens
- **FR-003**: Service MUST validate API key ownership against organization before executing operations
- **FR-004**: Service MUST return consistent error responses with error codes, messages, and request IDs
- **FR-005**: Service MUST log all API requests with correlation IDs for tracing

**Scan Operations:**
- **FR-010**: Service MUST accept scan requests with target URL, authentication config, and scan options
- **FR-011**: Service MUST start Temporal workflow for scan execution and return workflow reference
- **FR-012**: Service MUST provide real-time scan progress via polling endpoint (SSE optional for v2)
- **FR-013**: Service MUST support scan cancellation with graceful shutdown and partial result preservation
- **FR-014**: Service MUST enforce concurrent scan limits per organization (configurable, default 3)
- **FR-015**: Service MUST queue excess scan requests and process in FIFO order

**Health and Monitoring:**
- **FR-020**: Service MUST expose `/health` endpoint with overall service status
- **FR-021**: Service MUST expose `/health/ready` endpoint for Kubernetes readiness probes
- **FR-022**: Service MUST expose `/health/live` endpoint for Kubernetes liveness probes
- **FR-023**: Service MUST expose `/metrics` endpoint in Prometheus format
- **FR-024**: Service MUST track and expose: active scans, completed scans, failed scans, average duration

**Authentication Validation:**
- **FR-030**: Service MUST expose `/api/v1/auth/validate` endpoint for credential testing
- **FR-031**: Service MUST support form-based, API token, Basic Auth, and SSO validation
- **FR-032**: Service MUST support TOTP code generation for 2FA-enabled targets
- **FR-033**: Service MUST return specific error codes for different validation failures

**Configuration Discovery:**
- **FR-040**: Service MUST expose `/api/v1/config/*` endpoints for configuration discovery
- **FR-041**: Service MUST return supported authentication methods with required fields
- **FR-042**: Service MUST return scan options with defaults and valid ranges

**Report Generation:**
- **FR-050**: Service MUST expose async report generation via `/api/v1/scans/{scanId}/reports`
- **FR-051**: Service MUST support multiple report formats (PDF, HTML, JSON, SARIF)
- **FR-052**: Service MUST provide report generation status and progress tracking

### Non-Functional Requirements

- **NFR-001**: API response time <500ms for non-scan operations (p95)
- **NFR-002**: Service startup time <30 seconds including dependency checks
- **NFR-003**: Service MUST handle 100 concurrent API requests without degradation
- **NFR-004**: Service MUST gracefully handle Temporal unavailability (queue requests, retry)
- **NFR-005**: Service MUST support horizontal scaling behind load balancer

### Key Entities

- **ScanRequest**: Incoming scan request with target URL, auth config, options, and tenant context

- **ScanJob**: Internal representation of a scan in progress, mapping to Temporal workflow

- **ScanProgress**: Real-time progress snapshot with phase, percentage, agents, and timing

- **ScanResult**: Completed scan output with findings, metrics, and report references

- **APIKey**: Authentication credential for service access, scoped to organization

- **ValidationRequest**: Auth validation request with credentials and target information

- **ValidationResult**: Validation outcome with success/failure and error details

- **ReportJob**: Async report generation job with status and progress tracking

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Web application can trigger scans via service API without direct Temporal client dependency

- **SC-002**: Health endpoint accurately reflects service and dependency status (verified by integration tests)

- **SC-003**: API authentication rejects 100% of requests without valid credentials

- **SC-004**: Scan progress endpoint returns updates within 2 seconds of workflow state changes

- **SC-005**: Service handles graceful shutdown without losing in-flight requests

- **SC-006**: API documentation (OpenAPI) is complete and validates against implementation

- **SC-007**: Service can be deployed independently of web application

- **SC-008**: Performance benchmarks: <500ms p95 for GET endpoints, <2s p95 for POST /scans

## Clarifications

*Questions to be answered during planning phase:*

- Q: Should the service use gRPC for internal communication or REST only?
  - Recommendation: REST for v1 (simplicity), consider gRPC for v2 if performance requires

- Q: How should API keys be provisioned - via web UI or separate admin API?
  - Recommendation: Web UI creates API keys, stored in shared database

- Q: Should the service maintain its own database or share with web app?
  - Recommendation: Shared PostgreSQL database, separate schema if needed

- Q: What authentication mechanism between web app and service?
  - Recommendation: Internal API key or mTLS for service-to-service auth

## Assumptions

1. **Temporal remains the orchestration layer**: The service wraps Temporal workflows, not replaces them.

2. **Shared database**: Web app and service share PostgreSQL for consistency; scan records written by service, read by web app.

3. **Container deployment**: Service deployed as Docker container, orchestrated by Kubernetes or Docker Compose.

4. **Internal network**: Service-to-service communication occurs on internal network; public API optional for v2.

5. **Existing scan logic preserved**: The transformation extracts existing `/src/` code into service, not a rewrite.

## Out of Scope

- Public API for external third-party integrations (future epic)
- GraphQL API (REST sufficient for current needs)
- Service mesh integration (Istio/Linkerd)
- Multi-region deployment architecture
- API gateway integration (can be added as infrastructure layer)
