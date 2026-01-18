# API Contracts: Container Isolation for Scans

**Feature**: 006-container-isolation | **Date**: 2026-01-18

## Overview

Container isolation is an internal infrastructure feature. APIs are primarily:
1. **Temporal Activities** - Workflow integration points
2. **Internal TypeScript Interfaces** - Container management module
3. **Kubernetes Resources** - Pod and NetworkPolicy templates

No public REST API endpoints are added by this feature.

---

## Temporal Activity Contracts

### createScanContainer

Creates a Kubernetes pod for scan execution.

**Activity Name**: `createScanContainer`
**Task Queue**: `shannon-container-tasks`
**Timeout**: 60 seconds
**Retry Policy**: 3 attempts, exponential backoff

```typescript
interface CreateScanContainerInput {
  scanId: string;
  organizationId: string;
  targetUrl: string;
  configOverrides?: Partial<ContainerConfigInput>;
}

interface CreateScanContainerOutput {
  containerId: string;
  podName: string;
  namespace: string;
  presignedUploadUrl: string;
}

// Activity signature
async function createScanContainer(
  input: CreateScanContainerInput
): Promise<CreateScanContainerOutput>;
```

**Error Codes**:
| Code | Description | Retryable |
|------|-------------|-----------|
| `CONTAINER_CREATION_FAILED` | K8s API error | Yes |
| `RESOURCE_QUOTA_EXCEEDED` | Tenant limit reached | No |
| `IMAGE_PULL_FAILED` | Registry unavailable | Yes |
| `NETWORK_POLICY_FAILED` | Cilium policy error | Yes |
| `INVALID_TARGET_URL` | URL validation failed | No |

---

### monitorContainerHealth

Emits heartbeats and monitors container status.

**Activity Name**: `monitorContainerHealth`
**Task Queue**: `shannon-container-tasks`
**Heartbeat Timeout**: 60 seconds
**Start-to-Close Timeout**: Max scan duration + 5 minutes

```typescript
interface MonitorContainerHealthInput {
  scanId: string;
  containerId: string;
  podName: string;
  namespace: string;
}

interface ContainerHealthStatus {
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TERMINATED';
  exitCode?: number;
  errorMessage?: string;
  metrics?: ContainerMetricsSnapshot;
}

// Activity signature (long-running with heartbeats)
async function monitorContainerHealth(
  input: MonitorContainerHealthInput
): Promise<ContainerHealthStatus>;
```

**Heartbeat Details**:
```typescript
interface ContainerHeartbeat {
  timestamp: string;
  cpuPercent: number;
  memoryMb: number;
  phase: string; // K8s pod phase
}
```

---

### terminateScanContainer

Terminates container and cleans up resources.

**Activity Name**: `terminateScanContainer`
**Task Queue**: `shannon-container-tasks`
**Timeout**: 120 seconds
**Retry Policy**: 3 attempts

```typescript
interface TerminateScanContainerInput {
  scanId: string;
  containerId: string;
  podName: string;
  namespace: string;
  graceful: boolean; // true = SIGTERM first, false = SIGKILL
}

interface TerminateScanContainerOutput {
  terminated: boolean;
  cleanupComplete: boolean;
  networkPolicyDeleted: boolean;
  volumeDestroyed: boolean;
}

// Activity signature
async function terminateScanContainer(
  input: TerminateScanContainerInput
): Promise<TerminateScanContainerOutput>;
```

---

### uploadDeliverables

Uploads scan results to cloud storage.

**Activity Name**: `uploadDeliverables`
**Task Queue**: `shannon-container-tasks`
**Timeout**: 300 seconds
**Retry Policy**: 3 attempts

```typescript
interface UploadDeliverablesInput {
  scanId: string;
  organizationId: string;
  presignedUploadUrl: string;
  deliverables: ScanDeliverables;
}

interface UploadDeliverablesOutput {
  uploaded: boolean;
  s3Key: string;
  sizeBytes: number;
  checksum: string;
}

// Activity signature
async function uploadDeliverables(
  input: UploadDeliverablesInput
): Promise<UploadDeliverablesOutput>;
```

---

## Internal TypeScript Interfaces

### ContainerManager

Main interface for container lifecycle operations.

```typescript
// shannon/src/container/types.ts

export interface ContainerManager {
  /**
   * Creates a new scan container with network policy and volume.
   */
  create(config: ContainerCreateRequest): Promise<ContainerCreateResponse>;

  /**
   * Gets current container status and metrics.
   */
  getStatus(containerId: string): Promise<ContainerStatus>;

  /**
   * Watches container for status changes.
   */
  watch(containerId: string, callback: ContainerEventCallback): Promise<void>;

  /**
   * Terminates container and cleans up resources.
   */
  terminate(containerId: string, options: TerminateOptions): Promise<void>;

  /**
   * Lists all containers for an organization.
   */
  listByOrganization(orgId: string): Promise<ContainerSummary[]>;

  /**
   * Runs cleanup job for orphaned containers.
   */
  cleanupOrphaned(): Promise<CleanupResult>;
}

export interface ContainerCreateRequest {
  scanId: string;
  organizationId: string;
  targetUrl: string;
  image: string;
  resourceLimits: ResourceLimits;
  secrets: SecretReference[];
  environment: Record<string, string>;
}

export interface ContainerCreateResponse {
  containerId: string;
  podName: string;
  namespace: string;
  networkPolicyName: string;
  volumeName: string;
  presignedUploadUrl: string;
}

export interface ContainerStatus {
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
  containerId: string | null;
  startTime: Date | null;
  finishTime: Date | null;
  exitCode: number | null;
  message: string | null;
  metrics: ContainerMetricsSnapshot | null;
}

export interface ContainerMetricsSnapshot {
  cpuUsagePercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  networkTxBytes: number;
  networkRxBytes: number;
  storageUsedMb: number;
}

export interface TerminateOptions {
  gracePeriodSeconds: number; // Default: 30
  force: boolean; // Skip grace period
}

export interface CleanupResult {
  orphanedCount: number;
  terminatedCount: number;
  failedCount: number;
  errors: string[];
}

export type ContainerEventCallback = (event: ContainerEvent) => void;

export interface ContainerEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  container: ContainerStatus;
  timestamp: Date;
}
```

---

### ResourceLimits

Plan-based resource allocation.

```typescript
// shannon/src/container/types.ts

export interface ResourceLimits {
  cpu: {
    request: string; // e.g., "500m"
    limit: string;   // e.g., "2000m"
  };
  memory: {
    request: string; // e.g., "1Gi"
    limit: string;   // e.g., "4Gi"
  };
  ephemeralStorage: {
    request: string; // e.g., "5Gi"
    limit: string;   // e.g., "10Gi"
  };
}

export interface PlanResourceLimits {
  planId: string;
  cpuCores: number;
  memoryMb: number;
  storageMb: number;
  networkEgressMbps: number;
  maxConcurrentContainers: number;
  maxScanDurationMinutes: number;
}

export function getPlanLimits(planId: string): PlanResourceLimits;
export function toK8sResourceLimits(plan: PlanResourceLimits): ResourceLimits;
```

---

### NetworkPolicyManager

FQDN-based network policy operations.

```typescript
// shannon/src/container/types.ts

export interface NetworkPolicyManager {
  /**
   * Creates CiliumNetworkPolicy for scan container.
   */
  create(config: NetworkPolicyConfig): Promise<string>;

  /**
   * Deletes network policy by name.
   */
  delete(policyName: string, namespace: string): Promise<void>;

  /**
   * Lists policies for organization (for audit).
   */
  listByOrganization(orgId: string): Promise<NetworkPolicySummary[]>;
}

export interface NetworkPolicyConfig {
  scanId: string;
  organizationId: string;
  namespace: string;
  targetHostname: string;
  additionalEgress?: EgressRule[];
}

export interface EgressRule {
  fqdn?: string;
  fqdnPattern?: string; // e.g., "*.s3.amazonaws.com"
  ports: number[];
  protocol: 'TCP' | 'UDP';
}

export interface NetworkPolicySummary {
  policyName: string;
  scanId: string;
  targetHostname: string;
  createdAt: Date;
}
```

---

## Kubernetes Resource Templates

### Scan Pod Template

```yaml
# Generated by ContainerManager.create()
apiVersion: v1
kind: Pod
metadata:
  name: scan-{{scanId}}
  namespace: scans
  labels:
    app: shannon-scanner
    shannon.io/scan-id: "{{scanId}}"
    shannon.io/org-id: "{{organizationId}}"
    shannon.io/managed-by: shannon-container-manager
  annotations:
    shannon.io/target-url: "{{targetUrl}}"
    shannon.io/created-at: "{{timestamp}}"
spec:
  restartPolicy: Never
  serviceAccountName: shannon-scanner
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    fsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: scanner
      image: "{{image}}"
      imagePullPolicy: IfNotPresent
      resources:
        requests:
          cpu: "{{cpuRequest}}"
          memory: "{{memoryRequest}}"
          ephemeral-storage: "{{storageRequest}}"
        limits:
          cpu: "{{cpuLimit}}"
          memory: "{{memoryLimit}}"
          ephemeral-storage: "{{storageLimit}}"
      env:
        - name: SCAN_ID
          value: "{{scanId}}"
        - name: TARGET_URL
          value: "{{targetUrl}}"
        - name: UPLOAD_URL
          value: "{{presignedUploadUrl}}"
        - name: TEMPORAL_ADDRESS
          value: "temporal.shannon-system.svc.cluster.local:7233"
      envFrom:
        - secretRef:
            name: shannon-api-keys
      volumeMounts:
        - name: workspace
          mountPath: /workspace
        - name: anthropic-key
          mountPath: /secrets/anthropic
          readOnly: true
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: false # Playwright needs write access
        capabilities:
          drop:
            - ALL
  volumes:
    - name: workspace
      emptyDir:
        sizeLimit: "{{storageLimit}}"
    - name: anthropic-key
      secret:
        secretName: anthropic-api-key
        items:
          - key: api-key
            path: key
  imagePullSecrets:
    - name: registry-credentials
  tolerations:
    - key: "shannon.io/scanner"
      operator: "Exists"
      effect: "NoSchedule"
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          preference:
            matchExpressions:
              - key: shannon.io/node-type
                operator: In
                values:
                  - scanner
```

---

### CiliumNetworkPolicy Template

```yaml
# Generated by NetworkPolicyManager.create()
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: scan-{{scanId}}-egress
  namespace: scans
  labels:
    shannon.io/scan-id: "{{scanId}}"
    shannon.io/org-id: "{{organizationId}}"
    shannon.io/managed-by: shannon-container-manager
spec:
  endpointSelector:
    matchLabels:
      shannon.io/scan-id: "{{scanId}}"
  egress:
    # DNS resolution (required for FQDN rules)
    - toEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: kube-system
            k8s-app: kube-dns
      toPorts:
        - ports:
            - port: "53"
              protocol: UDP

    # Scan target (dynamic per scan)
    - toFQDNs:
        - matchName: "{{targetHostname}}"
      toPorts:
        - ports:
            - port: "80"
              protocol: TCP
            - port: "443"
              protocol: TCP

    # Temporal server (internal)
    - toEndpoints:
        - matchLabels:
            app: temporal
            k8s:io.kubernetes.pod.namespace: shannon-system
      toPorts:
        - ports:
            - port: "7233"
              protocol: TCP

    # Cloud storage (S3/GCS for deliverables)
    - toFQDNs:
        - matchPattern: "*.s3.amazonaws.com"
        - matchPattern: "*.s3.*.amazonaws.com"
        - matchPattern: "*.storage.googleapis.com"
      toPorts:
        - ports:
            - port: "443"
              protocol: TCP

    # Anthropic API
    - toFQDNs:
        - matchName: "api.anthropic.com"
      toPorts:
        - ports:
            - port: "443"
              protocol: TCP

  # Block cloud metadata (SSRF protection)
  egressDeny:
    - toCIDRSet:
        - cidr: "169.254.0.0/16"
    - toCIDRSet:
        - cidr: "10.0.0.0/8"
          except:
            - "10.96.0.0/12" # Allow K8s service CIDR
```

---

## Error Response Format

All activity errors follow this structure:

```typescript
interface ContainerActivityError {
  code: string;           // Error code (see tables above)
  message: string;        // Human-readable message
  retryable: boolean;     // Whether to retry
  details?: {
    scanId?: string;
    containerId?: string;
    k8sError?: string;    // Raw K8s API error
    resourceType?: string; // Pod, NetworkPolicy, etc.
  };
}
```

**Example Error**:
```json
{
  "code": "RESOURCE_QUOTA_EXCEEDED",
  "message": "Organization has reached maximum concurrent container limit (5)",
  "retryable": false,
  "details": {
    "scanId": "scan-123",
    "organizationId": "org-456",
    "currentCount": 5,
    "maxAllowed": 5
  }
}
```
