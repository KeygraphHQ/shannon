/**
 * Container Isolation Types
 *
 * Type definitions for containerized scan execution.
 * Based on specs/006-container-isolation/contracts/api.md
 *
 * @module container/types
 */

// =============================================================================
// Container Status Enum (T008)
// =============================================================================

/**
 * Lifecycle state of a scan container.
 * Maps to Kubernetes pod phases with Shannon-specific states.
 */
export enum ContainerStatus {
  /** Waiting for container creation */
  PENDING = 'PENDING',
  /** Container being provisioned */
  CREATING = 'CREATING',
  /** Container executing scan */
  RUNNING = 'RUNNING',
  /** Scan completed successfully */
  SUCCEEDED = 'SUCCEEDED',
  /** Scan failed or container crashed */
  FAILED = 'FAILED',
  /** Container forcefully terminated (timeout/cancellation) */
  TERMINATED = 'TERMINATED',
  /** Container terminated, awaiting resource cleanup */
  CLEANUP = 'CLEANUP',
}

// =============================================================================
// Error Types (T009)
// =============================================================================

/**
 * Error codes for container operations.
 * Used for distinguishing retryable vs permanent failures.
 */
export enum ContainerErrorCode {
  /** K8s API error during container creation */
  CONTAINER_CREATION_FAILED = 'CONTAINER_CREATION_FAILED',
  /** Organization has reached concurrent container limit */
  RESOURCE_QUOTA_EXCEEDED = 'RESOURCE_QUOTA_EXCEEDED',
  /** Container image could not be pulled from registry */
  IMAGE_PULL_FAILED = 'IMAGE_PULL_FAILED',
  /** Cilium network policy creation failed */
  NETWORK_POLICY_FAILED = 'NETWORK_POLICY_FAILED',
  /** Target URL validation failed */
  INVALID_TARGET_URL = 'INVALID_TARGET_URL',
  /** Container exceeded memory limit */
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  /** Container exceeded storage quota */
  STORAGE_LIMIT_EXCEEDED = 'STORAGE_LIMIT_EXCEEDED',
}

/**
 * Error response from container operations.
 */
export interface ContainerActivityError {
  /** Error code from ContainerErrorCode enum */
  code: ContainerErrorCode;
  /** Human-readable error message */
  message: string;
  /** Whether this error is retryable */
  retryable: boolean;
  /** Additional error context */
  details?: {
    scanId?: string;
    containerId?: string;
    k8sError?: string;
    resourceType?: string;
  };
}

// =============================================================================
// Resource Limits Types
// =============================================================================

/**
 * Kubernetes resource limits for a container.
 * Uses Kubernetes resource quantity format (e.g., "500m", "1Gi").
 */
export interface ResourceLimits {
  cpu: {
    /** Minimum CPU guaranteed (e.g., "500m") */
    request: string;
    /** Maximum CPU allowed (e.g., "2000m") */
    limit: string;
  };
  memory: {
    /** Minimum memory guaranteed (e.g., "1Gi") */
    request: string;
    /** Maximum memory allowed (e.g., "4Gi") */
    limit: string;
  };
  ephemeralStorage: {
    /** Minimum storage guaranteed (e.g., "5Gi") */
    request: string;
    /** Maximum storage allowed (e.g., "10Gi") */
    limit: string;
  };
}

/**
 * Resource limits configuration per subscription plan.
 */
export interface PlanResourceLimits {
  /** Plan identifier (e.g., "free", "pro", "enterprise") */
  planId: string;
  /** CPU cores limit */
  cpuCores: number;
  /** Memory limit in MB */
  memoryMb: number;
  /** Ephemeral storage limit in MB */
  storageMb: number;
  /** Network egress limit in Mbps */
  networkEgressMbps: number;
  /** Maximum concurrent containers per organization */
  maxConcurrentContainers: number;
  /** Maximum scan duration in minutes */
  maxScanDurationMinutes: number;
}

// =============================================================================
// Container Manager Types
// =============================================================================

/**
 * Reference to a Kubernetes secret.
 */
export interface SecretReference {
  /** Secret name in Kubernetes */
  name: string;
  /** Mount path in container (for volume mounts) */
  mountPath?: string;
  /** Specific key from secret (for volume mounts) */
  key?: string;
}

/**
 * Request to create a new scan container.
 */
export interface ContainerCreateRequest {
  /** Unique scan identifier */
  scanId: string;
  /** Organization/tenant identifier for isolation */
  organizationId: string;
  /** Subscription plan for resource limits */
  planId?: string | undefined;
  /** Target hostname for network policy egress rules */
  targetHostname: string;
  /** Container image to use (optional, uses default if not provided) */
  image?: string | undefined;
  /** Pin to specific image digest */
  imageDigest?: string | undefined;
  /** Environment variables for the container */
  environmentVars?: Record<string, string> | undefined;
  /** Override container command */
  command?: string[] | undefined;
  /** Override container args */
  args?: string[] | undefined;
  /** Kubernetes secrets to mount */
  secretRefs?: {
    envFrom?: string[];
    volumeMounts?: Array<{ name: string; mountPath: string; key: string }>;
  } | undefined;
  /** Presigned URL for uploading deliverables */
  presignedUploadUrl?: string | undefined;
  /** Temporal workflow ID for correlation */
  workflowId?: string | undefined;
}

/**
 * Response from container creation.
 */
export interface ContainerCreateResponse {
  /** Docker/containerd container ID */
  containerId: string;
  /** Kubernetes pod name */
  podName: string;
  /** Kubernetes namespace */
  namespace: string;
  /** Current container status */
  status: ContainerStatus;
}

/**
 * Response from getting container status.
 */
export interface ContainerStatusResponse {
  /** Container lifecycle status */
  status: ContainerStatus;
  /** Kubernetes pod phase */
  podPhase?: string | undefined;
  /** Container exit code */
  exitCode?: number | undefined;
  /** Error message if failed */
  errorMessage?: string | undefined;
  /** Container start time */
  startedAt?: Date | undefined;
  /** Container termination time */
  terminatedAt?: Date | undefined;
}

/**
 * Current status of a container with optional metrics.
 */
export interface ContainerStatusInfo {
  /** Kubernetes pod phase */
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
  /** Container ID (null if not yet assigned) */
  containerId: string | null;
  /** Container start time */
  startTime: Date | null;
  /** Container finish time */
  finishTime: Date | null;
  /** Container exit code (0 = success) */
  exitCode: number | null;
  /** Status message or error description */
  message: string | null;
  /** Current resource usage metrics */
  metrics: ContainerMetricsSnapshot | null;
}

/**
 * Point-in-time container resource usage.
 */
export interface ContainerMetricsSnapshot {
  /** CPU usage as percentage (0-100) */
  cpuUsagePercent: number;
  /** Memory usage in MB */
  memoryUsedMb: number;
  /** Memory limit in MB */
  memoryLimitMb: number;
  /** Network bytes transmitted */
  networkTxBytes: number;
  /** Network bytes received */
  networkRxBytes: number;
  /** Ephemeral storage used in MB */
  storageUsedMb: number;
}

/**
 * Options for container termination.
 */
export interface TerminateOptions {
  /** Seconds to wait for graceful shutdown before SIGKILL (default: 30) */
  gracePeriodSeconds: number;
  /** Skip grace period and force immediate termination */
  force: boolean;
}

/**
 * Result from cleanup job execution.
 */
export interface CleanupResult {
  /** Number of orphaned containers found */
  orphanedCount: number;
  /** Number of containers successfully terminated */
  terminatedCount: number;
  /** Number of containers that failed to terminate */
  failedCount: number;
  /** Error messages for failed terminations */
  errors: string[];
}

/**
 * Container lifecycle event.
 */
export interface ContainerEvent {
  /** Event type */
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  /** Container status at time of event */
  container: ContainerStatusInfo;
  /** Event timestamp */
  timestamp: Date;
}

/**
 * Callback for container event watching.
 */
export type ContainerEventCallback = (event: ContainerEvent) => void;

/**
 * Summary of a container for listing operations.
 */
export interface ContainerSummary {
  /** Container ID */
  containerId: string;
  /** Associated scan ID */
  scanId: string;
  /** Organization ID */
  organizationId: string;
  /** Current status */
  status: ContainerStatus;
  /** Creation timestamp */
  createdAt: Date;
}

// =============================================================================
// Network Policy Types
// =============================================================================

/**
 * Configuration for creating a network policy.
 */
export interface NetworkPolicyConfig {
  /** Associated scan ID */
  scanId: string;
  /** Organization ID for labels */
  organizationId: string;
  /** Kubernetes namespace */
  namespace: string;
  /** Target hostname for FQDN egress rule */
  targetHostname: string;
  /** Additional egress rules */
  additionalEgress?: EgressRule[];
}

/**
 * Network egress rule definition.
 */
export interface EgressRule {
  /** Exact FQDN to allow */
  fqdn?: string;
  /** FQDN pattern with wildcards (e.g., "*.s3.amazonaws.com") */
  fqdnPattern?: string;
  /** Allowed destination ports */
  ports: number[];
  /** Protocol (TCP or UDP) */
  protocol: 'TCP' | 'UDP';
}

/**
 * Summary of a network policy.
 */
export interface NetworkPolicySummary {
  /** Kubernetes policy name */
  policyName: string;
  /** Associated scan ID */
  scanId: string;
  /** Target hostname allowed */
  targetHostname: string;
  /** Policy creation time */
  createdAt: Date;
}

// =============================================================================
// Storage Types
// =============================================================================

/**
 * Configuration for deliverable upload.
 */
export interface DeliverableUploadConfig {
  /** Organization ID for path prefix */
  organizationId: string;
  /** Scan ID for path prefix */
  scanId: string;
  /** S3 bucket name */
  bucket: string;
  /** AWS region */
  region: string;
  /** URL expiration in seconds */
  expiresIn: number;
}

/**
 * Result from deliverable upload.
 */
export interface UploadResult {
  /** Whether upload succeeded */
  uploaded: boolean;
  /** S3 object key */
  s3Key: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Content checksum */
  checksum: string;
}

// =============================================================================
// Temporal Activity Types
// =============================================================================

/**
 * Input for createScanContainer activity.
 */
export interface CreateScanContainerInput {
  scanId: string;
  organizationId: string;
  planId?: string | undefined;
  targetHostname: string;
  image?: string | undefined;
  imageDigest?: string | undefined;
  environmentVars?: Record<string, string> | undefined;
  command?: string[] | undefined;
  args?: string[] | undefined;
  secretRefs?: {
    envFrom?: string[];
    volumeMounts?: Array<{ name: string; mountPath: string; key: string }>;
  } | undefined;
  presignedUploadUrl?: string | undefined;
  workflowId?: string | undefined;
}

/**
 * Output from createScanContainer activity.
 */
export interface CreateScanContainerOutput {
  containerId: string;
  podName: string;
  namespace: string;
  status: ContainerStatus;
}

/**
 * Input for monitorContainerHealth activity.
 */
export interface MonitorContainerHealthInput {
  scanId: string;
  containerId: string;
  podName: string;
  namespace: string;
}

/**
 * Output from monitorContainerHealth activity.
 */
export interface ContainerHealthStatus {
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TERMINATED';
  exitCode?: number;
  errorMessage?: string;
  metrics?: ContainerMetricsSnapshot;
}

/**
 * Input for terminateScanContainer activity.
 */
export interface TerminateScanContainerInput {
  podName: string;
  namespace: string;
  gracePeriodSeconds?: number;
}

/**
 * Output from terminateScanContainer activity.
 */
export interface TerminateScanContainerOutput {
  success: boolean;
  terminatedAt: Date;
}

/**
 * Input for uploadDeliverables activity.
 */
export interface UploadDeliverablesInput {
  scanId: string;
  organizationId: string;
  presignedUploadUrl: string;
  deliverables: Record<string, unknown>;
}

/**
 * Output from uploadDeliverables activity.
 */
export interface UploadDeliverablesOutput {
  uploaded: boolean;
  s3Key: string;
  sizeBytes: number;
  checksum: string;
}

/**
 * Heartbeat data emitted during container monitoring.
 */
export interface ContainerHeartbeat {
  timestamp: string;
  cpuPercent: number;
  memoryMb: number;
  phase: string;
}
