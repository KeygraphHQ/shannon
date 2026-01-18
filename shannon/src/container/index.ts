/**
 * Container Isolation Module
 *
 * Provides containerized sandbox isolation for security scan execution.
 * Each scan runs in a dedicated Kubernetes pod with:
 * - Strict resource limits (CPU/memory/storage)
 * - Network isolation via Cilium FQDN policies
 * - Automatic lifecycle management
 *
 * @module container
 */

// Types and interfaces
export * from './types.js';

// Resource limit management
export * from './resource-limits.js';

// Kubernetes client wrapper
export { KubernetesClient } from './kubernetes-client.js';

// Container lifecycle management
export { ContainerManager } from './container-manager.js';

// Network policy management
export { NetworkPolicyManager } from './network-policy.js';

// Storage management
export { StorageManager } from './storage-manager.js';

// Cleanup job
export { CleanupJob } from './cleanup-job.js';
