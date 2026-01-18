/**
 * Kubernetes Client Wrapper
 *
 * Provides a simplified interface for Kubernetes API operations
 * specific to container isolation needs.
 *
 * @module container/kubernetes-client
 */

import * as k8s from '@kubernetes/client-node';
import type {
  ContainerStatusInfo,
  ContainerMetricsSnapshot,
  ContainerEvent,
  ContainerEventCallback,
} from './types.js';

/**
 * Configuration for KubernetesClient.
 */
export interface KubernetesClientConfig {
  /** Namespace for scan containers (default: "scans") */
  namespace?: string;
  /** Whether to load from in-cluster config (default: true in K8s, false otherwise) */
  inCluster?: boolean;
}

/**
 * Kubernetes client wrapper for container isolation operations.
 *
 * Handles authentication, pod management, and resource watching.
 */
export class KubernetesClient {
  private kubeConfig: k8s.KubeConfig;
  private coreApi: k8s.CoreV1Api;
  private customObjectsApi: k8s.CustomObjectsApi;
  private readonly namespace: string;

  constructor(config: KubernetesClientConfig = {}) {
    this.namespace = config.namespace ?? process.env.K8S_NAMESPACE ?? 'scans';
    this.kubeConfig = new k8s.KubeConfig();

    // T011: Authentication - loadFromDefault handles both in-cluster and kubeconfig
    if (config.inCluster ?? this.isRunningInCluster()) {
      this.kubeConfig.loadFromCluster();
    } else {
      this.kubeConfig.loadFromDefault();
    }

    this.coreApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.customObjectsApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);
  }

  /**
   * Detect if running inside a Kubernetes cluster.
   */
  private isRunningInCluster(): boolean {
    return (
      process.env.KUBERNETES_SERVICE_HOST !== undefined &&
      process.env.KUBERNETES_SERVICE_PORT !== undefined
    );
  }

  /**
   * Get the configured namespace.
   */
  getNamespace(): string {
    return this.namespace;
  }

  // ===========================================================================
  // Pod Operations
  // ===========================================================================

  /**
   * Create a new pod.
   *
   * @param pod - Pod specification
   * @param namespace - Optional namespace override
   * @returns Created pod object
   */
  async createPod(pod: k8s.V1Pod, namespace?: string): Promise<k8s.V1Pod> {
    const ns = namespace ?? this.namespace;
    const response = await this.coreApi.createNamespacedPod({ namespace: ns, body: pod });
    return response;
  }

  /**
   * Get a pod by name.
   *
   * @param name - Pod name
   * @param namespace - Optional namespace override
   * @returns Pod object or null if not found
   */
  async getPod(name: string, namespace?: string): Promise<k8s.V1Pod | null> {
    const ns = namespace ?? this.namespace;
    try {
      const response = await this.coreApi.readNamespacedPod({ name, namespace: ns });
      return response;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a pod.
   *
   * @param name - Pod name
   * @param namespace - Optional namespace override
   * @param gracePeriodSeconds - Grace period for termination (default: 30)
   */
  async deletePod(
    name: string,
    namespace?: string,
    gracePeriodSeconds: number = 30
  ): Promise<void> {
    const ns = namespace ?? this.namespace;
    try {
      await this.coreApi.deleteNamespacedPod({
        name,
        namespace: ns,
        body: {
          gracePeriodSeconds,
        },
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
      // Pod already deleted, ignore
    }
  }

  /**
   * List pods with label selector.
   *
   * @param labelSelector - Kubernetes label selector (e.g., "app=scanner")
   * @param namespace - Optional namespace override
   * @returns Array of pods
   */
  async listPods(labelSelector: string, namespace?: string): Promise<k8s.V1Pod[]> {
    const ns = namespace ?? this.namespace;
    const response = await this.coreApi.listNamespacedPod({
      namespace: ns,
      labelSelector,
    });
    return response.items;
  }

  /**
   * Get pod status information.
   *
   * @param name - Pod name
   * @param namespace - Optional namespace override
   * @returns Container status or null if pod not found
   */
  async getPodStatus(name: string, namespace?: string): Promise<ContainerStatusInfo | null> {
    const pod = await this.getPod(name, namespace);
    if (!pod) {
      return null;
    }
    return this.podToContainerStatus(pod);
  }

  /**
   * Watch pods for changes.
   *
   * @param labelSelector - Label selector for pods to watch
   * @param callback - Callback for pod events
   * @param namespace - Optional namespace override
   * @returns Abort function to stop watching
   */
  async watchPods(
    labelSelector: string,
    callback: ContainerEventCallback,
    namespace?: string
  ): Promise<() => void> {
    const ns = namespace ?? this.namespace;
    const watch = new k8s.Watch(this.kubeConfig);
    const path = `/api/v1/namespaces/${ns}/pods`;

    const abortController = new AbortController();

    watch.watch(
      path,
      { labelSelector },
      (type: string, pod: k8s.V1Pod) => {
        const event: ContainerEvent = {
          type: type as 'ADDED' | 'MODIFIED' | 'DELETED',
          container: this.podToContainerStatus(pod),
          timestamp: new Date(),
        };
        callback(event);
      },
      (err: Error) => {
        if (!abortController.signal.aborted) {
          console.error('Watch error:', err);
        }
      }
    );

    return () => {
      abortController.abort();
    };
  }

  // ===========================================================================
  // CiliumNetworkPolicy Operations (Custom Resource)
  // ===========================================================================

  /**
   * Create a CiliumNetworkPolicy.
   *
   * @param policy - Policy manifest
   * @param namespace - Optional namespace override
   */
  async createCiliumNetworkPolicy(
    policy: Record<string, unknown>,
    namespace?: string
  ): Promise<void> {
    const ns = namespace ?? this.namespace;
    await this.customObjectsApi.createNamespacedCustomObject({
      group: 'cilium.io',
      version: 'v2',
      namespace: ns,
      plural: 'ciliumnetworkpolicies',
      body: policy,
    });
  }

  /**
   * Delete a CiliumNetworkPolicy.
   *
   * @param name - Policy name
   * @param namespace - Optional namespace override
   */
  async deleteCiliumNetworkPolicy(name: string, namespace?: string): Promise<void> {
    const ns = namespace ?? this.namespace;
    try {
      await this.customObjectsApi.deleteNamespacedCustomObject({
        group: 'cilium.io',
        version: 'v2',
        namespace: ns,
        plural: 'ciliumnetworkpolicies',
        name,
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
      // Policy already deleted, ignore
    }
  }

  /**
   * List CiliumNetworkPolicies with label selector.
   *
   * @param labelSelector - Label selector
   * @param namespace - Optional namespace override
   */
  async listCiliumNetworkPolicies(
    labelSelector: string,
    namespace?: string
  ): Promise<k8s.KubernetesObject[]> {
    const ns = namespace ?? this.namespace;
    const response = await this.customObjectsApi.listNamespacedCustomObject({
      group: 'cilium.io',
      version: 'v2',
      namespace: ns,
      plural: 'ciliumnetworkpolicies',
      labelSelector,
    });
    return (response as { items: k8s.KubernetesObject[] }).items ?? [];
  }

  // ===========================================================================
  // Metrics Operations
  // ===========================================================================

  /**
   * Get pod metrics (requires metrics-server).
   *
   * @param name - Pod name
   * @param namespace - Optional namespace override
   * @returns Metrics snapshot or null if not available
   */
  async getPodMetrics(
    name: string,
    namespace?: string
  ): Promise<ContainerMetricsSnapshot | null> {
    const ns = namespace ?? this.namespace;
    try {
      const response = await this.customObjectsApi.getNamespacedCustomObject({
        group: 'metrics.k8s.io',
        version: 'v1beta1',
        namespace: ns,
        plural: 'pods',
        name,
      });

      const metrics = response as {
        containers?: Array<{
          usage?: { cpu?: string; memory?: string };
        }>;
      };

      if (!metrics.containers || metrics.containers.length === 0) {
        return null;
      }

      const container = metrics.containers[0];
      if (!container) {
        return null;
      }
      return {
        cpuUsagePercent: this.parseCpuUsage(container.usage?.cpu ?? '0'),
        memoryUsedMb: this.parseMemoryUsage(container.usage?.memory ?? '0'),
        memoryLimitMb: 0, // Would need pod spec to get limit
        networkTxBytes: 0, // Not available from metrics API
        networkRxBytes: 0,
        storageUsedMb: 0,
      };
    } catch {
      // Metrics not available
      return null;
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Convert pod to ContainerStatusInfo.
   */
  private podToContainerStatus(pod: k8s.V1Pod): ContainerStatusInfo {
    const status = pod.status;
    const containerStatus = status?.containerStatuses?.[0];

    let phase: ContainerStatusInfo['phase'] = 'Unknown';
    if (status?.phase) {
      phase = status.phase as ContainerStatusInfo['phase'];
    }

    let exitCode: number | null = null;
    let message: string | null = null;

    if (containerStatus?.state?.terminated) {
      exitCode = containerStatus.state.terminated.exitCode ?? null;
      message = containerStatus.state.terminated.reason ?? null;
    } else if (containerStatus?.state?.waiting) {
      message = containerStatus.state.waiting.reason ?? null;
    }

    return {
      phase,
      containerId: containerStatus?.containerID ?? null,
      startTime: status?.startTime ? new Date(status.startTime) : null,
      finishTime: containerStatus?.state?.terminated?.finishedAt
        ? new Date(containerStatus.state.terminated.finishedAt)
        : null,
      exitCode,
      message,
      metrics: null, // Metrics fetched separately
    };
  }

  /**
   * Check if error is a 404 Not Found.
   */
  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return (error as { statusCode: number }).statusCode === 404;
    }
    return false;
  }

  /**
   * Parse CPU usage string (e.g., "100m" -> percentage).
   */
  private parseCpuUsage(cpu: string): number {
    if (cpu.endsWith('m')) {
      return parseInt(cpu.slice(0, -1), 10) / 10; // millicores to percentage
    }
    if (cpu.endsWith('n')) {
      return parseInt(cpu.slice(0, -1), 10) / 10_000_000; // nanocores to percentage
    }
    return parseFloat(cpu) * 100;
  }

  /**
   * Parse memory usage string (e.g., "128Mi" -> MB).
   */
  private parseMemoryUsage(memory: string): number {
    const units: Record<string, number> = {
      Ki: 1024,
      Mi: 1024 * 1024,
      Gi: 1024 * 1024 * 1024,
      K: 1000,
      M: 1000 * 1000,
      G: 1000 * 1000 * 1000,
    };

    for (const [unit, multiplier] of Object.entries(units)) {
      if (memory.endsWith(unit)) {
        const value = parseInt(memory.slice(0, -unit.length), 10);
        return Math.round((value * multiplier) / (1024 * 1024)); // Convert to MB
      }
    }

    return parseInt(memory, 10) / (1024 * 1024); // Assume bytes
  }
}
