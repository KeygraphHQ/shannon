/**
 * Resource Limits Module
 *
 * Defines plan-based resource allocation for scan containers.
 * Maps subscription plans to CPU, memory, storage, and network limits.
 */

import type { PlanResourceLimits, ResourceLimits } from './types.js';

/**
 * Default resource limits per subscription plan
 */
export const PLAN_DEFAULTS: Record<string, PlanResourceLimits> = {
  free: {
    planId: 'free',
    cpuCores: 1,
    memoryMb: 2048,
    storageMb: 5120,
    networkEgressMbps: 100,
    maxConcurrentContainers: 1,
    maxScanDurationMinutes: 30,
  },
  pro: {
    planId: 'pro',
    cpuCores: 2,
    memoryMb: 4096,
    storageMb: 10240,
    networkEgressMbps: 500,
    maxConcurrentContainers: 5,
    maxScanDurationMinutes: 60,
  },
  enterprise: {
    planId: 'enterprise',
    cpuCores: 4,
    memoryMb: 8192,
    storageMb: 20480,
    networkEgressMbps: 1000,
    maxConcurrentContainers: 20,
    maxScanDurationMinutes: 120,
  },
};

/**
 * Get resource limits for a subscription plan
 *
 * @param planId - Subscription plan identifier (free, pro, enterprise)
 * @returns Resource limits for the plan, or free tier defaults if unknown
 */
export function getPlanLimits(planId: string): PlanResourceLimits {
  const limits = PLAN_DEFAULTS[planId.toLowerCase()];
  if (!limits) {
    // Default to free tier for unknown plans
    return PLAN_DEFAULTS.free!;
  }
  return limits;
}

/**
 * Convert plan resource limits to Kubernetes resource specifications
 *
 * Kubernetes uses specific formats:
 * - CPU: millicores (e.g., "500m" = 0.5 cores, "2000m" = 2 cores)
 * - Memory: bytes with suffix (e.g., "2Gi", "4096Mi")
 * - Storage: bytes with suffix (e.g., "5Gi", "10240Mi")
 *
 * @param limits - Plan-based resource limits
 * @returns Kubernetes-formatted resource limits
 */
export function toK8sResourceLimits(limits: PlanResourceLimits): ResourceLimits {
  // Request is typically 50% of limit for CPU, 75% for memory
  // This allows burstable QoS class while preventing resource starvation
  const cpuRequestMillis = Math.floor(limits.cpuCores * 500); // 50% of limit
  const cpuLimitMillis = limits.cpuCores * 1000;
  const memoryRequestMb = Math.floor(limits.memoryMb * 0.75);
  const storageRequestMb = Math.floor(limits.storageMb * 0.5);

  return {
    cpu: {
      request: `${cpuRequestMillis}m`,
      limit: `${cpuLimitMillis}m`,
    },
    memory: {
      request: `${memoryRequestMb}Mi`,
      limit: `${limits.memoryMb}Mi`,
    },
    ephemeralStorage: {
      request: `${storageRequestMb}Mi`,
      limit: `${limits.storageMb}Mi`,
    },
  };
}

/**
 * Get Kubernetes resource limits directly from a plan ID
 *
 * Convenience function that combines getPlanLimits and toK8sResourceLimits
 *
 * @param planId - Subscription plan identifier
 * @returns Kubernetes-formatted resource limits
 */
export function getK8sResourceLimitsForPlan(planId: string): ResourceLimits {
  const planLimits = getPlanLimits(planId);
  return toK8sResourceLimits(planLimits);
}

/**
 * Validate that resource limits are within acceptable bounds
 *
 * @param limits - Resource limits to validate
 * @returns true if valid, throws Error if invalid
 */
export function validateResourceLimits(limits: PlanResourceLimits): boolean {
  if (limits.cpuCores < 0.5 || limits.cpuCores > 8) {
    throw new Error(`CPU cores must be between 0.5 and 8, got ${limits.cpuCores}`);
  }
  if (limits.memoryMb < 512 || limits.memoryMb > 16384) {
    throw new Error(`Memory must be between 512MB and 16384MB, got ${limits.memoryMb}MB`);
  }
  if (limits.storageMb < 1024 || limits.storageMb > 51200) {
    throw new Error(`Storage must be between 1024MB and 51200MB, got ${limits.storageMb}MB`);
  }
  if (limits.networkEgressMbps < 10 || limits.networkEgressMbps > 1000) {
    throw new Error(
      `Network egress must be between 10Mbps and 1000Mbps, got ${limits.networkEgressMbps}Mbps`
    );
  }
  if (limits.maxConcurrentContainers < 1 || limits.maxConcurrentContainers > 20) {
    throw new Error(
      `Concurrent containers must be between 1 and 20, got ${limits.maxConcurrentContainers}`
    );
  }
  if (limits.maxScanDurationMinutes < 10 || limits.maxScanDurationMinutes > 120) {
    throw new Error(
      `Scan duration must be between 10 and 120 minutes, got ${limits.maxScanDurationMinutes}`
    );
  }
  return true;
}
