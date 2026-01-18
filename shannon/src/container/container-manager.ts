/**
 * Container Manager
 *
 * Manages the lifecycle of Kubernetes pods for scan execution.
 * Handles pod creation, monitoring, and termination with proper security contexts.
 */

import type { V1Pod, V1PodSpec, V1Container, V1EnvVar } from '@kubernetes/client-node';
import { KubernetesClient } from './kubernetes-client.js';
import { toK8sResourceLimits, getPlanLimits } from './resource-limits.js';
import {
  ContainerStatus,
  type ContainerCreateRequest,
  type ContainerCreateResponse,
  type ContainerStatusResponse,
  type ResourceLimits,
} from './types.js';

/**
 * Pod labels applied to all scan containers
 */
export type PodLabels = {
  [key: string]: string;
};

/**
 * Options for building a pod specification
 */
export interface BuildPodSpecOptions {
  scanId: string;
  organizationId: string;
  image: string;
  imageDigest?: string | undefined;
  resourceLimits: ResourceLimits;
  targetHostname: string;
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
 * Container Manager class
 *
 * Manages Kubernetes pod lifecycle for scan containers
 */
export class ContainerManager {
  private readonly k8sClient: KubernetesClient;
  private readonly namespace: string;
  private readonly defaultImage: string;

  constructor(options?: { namespace?: string; defaultImage?: string }) {
    this.k8sClient = new KubernetesClient();
    this.namespace = options?.namespace ?? process.env.K8S_NAMESPACE ?? 'scans';
    this.defaultImage = options?.defaultImage ?? process.env.SCANNER_IMAGE ?? 'shannon-scanner:latest';
  }

  /**
   * Build a Kubernetes Pod specification for a scan container
   *
   * @param options - Pod specification options
   * @returns V1Pod manifest ready for creation
   */
  buildPodSpec(options: BuildPodSpecOptions): V1Pod {
    const {
      scanId,
      organizationId,
      image,
      imageDigest,
      resourceLimits,
      targetHostname,
      environmentVars = {},
      command,
      args,
      secretRefs,
      presignedUploadUrl,
      workflowId,
    } = options;

    const podName = `scan-${scanId.substring(0, 8)}-${Date.now()}`;
    const imageRef = imageDigest ? `${image}@${imageDigest}` : image;

    // Build environment variables
    const envVars: V1EnvVar[] = [
      { name: 'SCAN_ID', value: scanId },
      { name: 'ORGANIZATION_ID', value: organizationId },
      { name: 'TARGET_HOSTNAME', value: targetHostname },
      ...Object.entries(environmentVars).map(([name, value]) => ({ name, value })),
    ];

    if (presignedUploadUrl) {
      envVars.push({ name: 'UPLOAD_URL', value: presignedUploadUrl });
    }

    if (workflowId) {
      envVars.push({ name: 'TEMPORAL_WORKFLOW_ID', value: workflowId });
    }

    // Build container spec
    const container: V1Container = {
      name: 'scanner',
      image: imageRef,
      env: envVars,
      resources: {
        requests: {
          cpu: resourceLimits.cpu.request,
          memory: resourceLimits.memory.request,
          'ephemeral-storage': resourceLimits.ephemeralStorage.request,
        },
        limits: {
          cpu: resourceLimits.cpu.limit,
          memory: resourceLimits.memory.limit,
          'ephemeral-storage': resourceLimits.ephemeralStorage.limit,
        },
      },
      // Security context at container level
      securityContext: {
        allowPrivilegeEscalation: false,
        readOnlyRootFilesystem: false, // Scanner needs write access for browser profiles
        runAsNonRoot: true,
        runAsUser: 1000,
        runAsGroup: 1000,
        capabilities: {
          drop: ['ALL'],
        },
      },
      // Volume mounts
      volumeMounts: [
        {
          name: 'workspace',
          mountPath: '/workspace',
        },
        {
          name: 'tmp',
          mountPath: '/tmp',
        },
      ],
    };

    // Add command/args if provided
    if (command && command.length > 0) {
      container.command = command;
    }
    if (args && args.length > 0) {
      container.args = args;
    }

    // Add secret volume mounts if provided
    if (secretRefs?.volumeMounts) {
      for (const mount of secretRefs.volumeMounts) {
        container.volumeMounts?.push({
          name: mount.name,
          mountPath: mount.mountPath,
          readOnly: true,
        });
      }
    }

    // Add envFrom for secrets if provided
    if (secretRefs?.envFrom && secretRefs.envFrom.length > 0) {
      container.envFrom = secretRefs.envFrom.map((secretName) => ({
        secretRef: { name: secretName },
      }));
    }

    // Build pod labels
    const labels: PodLabels = {
      'shannon.io/scan-id': scanId,
      'shannon.io/org-id': organizationId,
      'shannon.io/managed-by': 'shannon-container-manager',
      'shannon.io/component': 'scan-container',
    };

    // Build volumes
    const volumes: V1PodSpec['volumes'] = [
      {
        name: 'workspace',
        emptyDir: {
          sizeLimit: resourceLimits.ephemeralStorage.limit,
        },
      },
      {
        name: 'tmp',
        emptyDir: {
          sizeLimit: '1Gi',
        },
      },
    ];

    // Add secret volumes if provided
    if (secretRefs?.volumeMounts) {
      for (const mount of secretRefs.volumeMounts) {
        volumes.push({
          name: mount.name,
          secret: {
            secretName: mount.name,
            items: [{ key: mount.key, path: mount.key }],
          },
        });
      }
    }

    // Build the complete pod spec
    const pod: V1Pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: podName,
        namespace: this.namespace,
        labels,
        annotations: {
          'shannon.io/created-at': new Date().toISOString(),
          'shannon.io/target-hostname': targetHostname,
        },
      },
      spec: {
        // Pod-level security context
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 1000,
          runAsGroup: 1000,
          fsGroup: 1000,
          seccompProfile: {
            type: 'RuntimeDefault',
          },
        },
        // Restart policy - never restart, let Temporal handle retries
        restartPolicy: 'Never',
        // Termination grace period
        terminationGracePeriodSeconds: 30,
        // Service account (if needed for specific permissions)
        automountServiceAccountToken: false,
        // Containers
        containers: [container],
        // Volumes
        volumes,
        // DNS policy
        dnsPolicy: 'ClusterFirst',
        // Node selection can be added via node selectors or affinity
        // Tolerations can be added for dedicated scan nodes
      },
    };

    return pod;
  }

  /**
   * Create a new scan container
   *
   * @param request - Container creation request
   * @returns Container creation response with pod details
   */
  async create(request: ContainerCreateRequest): Promise<ContainerCreateResponse> {
    const {
      scanId,
      organizationId,
      planId,
      targetHostname,
      image,
      imageDigest,
      environmentVars,
      command,
      args,
      secretRefs,
      presignedUploadUrl,
      workflowId,
    } = request;

    // Get resource limits based on plan
    const planLimits = getPlanLimits(planId ?? 'free');
    const resourceLimits = toK8sResourceLimits(planLimits);

    // Check concurrent container limit
    const runningContainers = await this.listByOrganization(organizationId, ['PENDING', 'CREATING', 'RUNNING']);
    if (runningContainers.length >= planLimits.maxConcurrentContainers) {
      throw new Error(
        `Concurrent container limit reached: ${runningContainers.length}/${planLimits.maxConcurrentContainers}`
      );
    }

    // Build pod spec
    const pod = this.buildPodSpec({
      scanId,
      organizationId,
      image: image ?? this.defaultImage,
      imageDigest,
      resourceLimits,
      targetHostname,
      environmentVars,
      command,
      args,
      secretRefs,
      presignedUploadUrl,
      workflowId,
    });

    // Create the pod
    const createdPod = await this.k8sClient.createPod(pod, this.namespace);

    return {
      containerId: createdPod.metadata?.uid ?? '',
      podName: createdPod.metadata?.name ?? '',
      namespace: this.namespace,
      status: ContainerStatus.PENDING,
    };
  }

  /**
   * Get the status of a container by pod name
   *
   * @param podName - Kubernetes pod name
   * @returns Container status response
   */
  async getStatus(podName: string): Promise<ContainerStatusResponse> {
    const pod = await this.k8sClient.getPod(podName, this.namespace);

    if (!pod) {
      return {
        status: ContainerStatus.FAILED,
        errorMessage: `Pod ${podName} not found`,
      };
    }

    const status = this.mapPodPhaseToStatus(pod.status?.phase);
    const containerStatus = pod.status?.containerStatuses?.[0];

    const response: ContainerStatusResponse = {
      status,
      podPhase: pod.status?.phase,
    };

    // Extract exit code if terminated
    if (containerStatus?.state?.terminated) {
      response.exitCode = containerStatus.state.terminated.exitCode;
      if (containerStatus.state.terminated.reason) {
        response.errorMessage = containerStatus.state.terminated.reason;
      }
    }

    // Extract start time
    if (containerStatus?.state?.running?.startedAt) {
      response.startedAt = new Date(containerStatus.state.running.startedAt);
    }

    // Extract termination time
    if (containerStatus?.state?.terminated?.finishedAt) {
      response.terminatedAt = new Date(containerStatus.state.terminated.finishedAt);
    }

    return response;
  }

  /**
   * Watch a container for status changes
   *
   * @param scanId - Scan ID to watch for
   * @param callback - Callback function for status updates
   * @returns Promise resolving to abort function to stop watching
   */
  async watch(
    scanId: string,
    callback: (status: ContainerStatusResponse) => void
  ): Promise<() => void> {
    const labelSelector = `shannon.io/scan-id=${scanId},shannon.io/managed-by=shannon-container-manager`;

    return this.k8sClient.watchPods(labelSelector, (event) => {
      const pod = event.container;
      const status = this.mapPodPhaseToStatus(pod.phase);

      const response: ContainerStatusResponse = {
        status,
        podPhase: pod.phase,
        exitCode: pod.exitCode ?? undefined,
        errorMessage: pod.message ?? undefined,
        startedAt: pod.startTime ?? undefined,
        terminatedAt: pod.finishTime ?? undefined,
      };

      callback(response);
    }, this.namespace);
  }

  /**
   * Terminate a container with graceful shutdown
   *
   * @param podName - Kubernetes pod name
   * @param gracePeriodSeconds - Grace period for shutdown (default: 30)
   */
  async terminate(podName: string, gracePeriodSeconds: number = 30): Promise<void> {
    await this.k8sClient.deletePod(podName, this.namespace, gracePeriodSeconds);
  }

  /**
   * List containers by organization
   *
   * @param organizationId - Organization ID
   * @param statuses - Optional filter by status values (e.g., ['PENDING', 'RUNNING'])
   * @returns Array of pod names
   */
  async listByOrganization(
    organizationId: string,
    statuses?: string[]
  ): Promise<string[]> {
    const labelSelector = `shannon.io/org-id=${organizationId},shannon.io/managed-by=shannon-container-manager`;
    const pods = await this.k8sClient.listPods(labelSelector, this.namespace);

    if (!statuses || statuses.length === 0) {
      return pods.map((pod) => pod.metadata?.name ?? '').filter(Boolean);
    }

    // Filter by status (compare enum values as strings)
    return pods
      .filter((pod) => {
        const podStatus = this.mapPodPhaseToStatus(pod.status?.phase);
        return statuses.includes(podStatus);
      })
      .map((pod) => pod.metadata?.name ?? '')
      .filter(Boolean);
  }

  /**
   * List containers by scan ID
   *
   * @param scanId - Scan ID
   * @returns Pod name if found, undefined otherwise
   */
  async findByScanId(scanId: string): Promise<string | undefined> {
    const labelSelector = `shannon.io/scan-id=${scanId},shannon.io/managed-by=shannon-container-manager`;
    const pods = await this.k8sClient.listPods(labelSelector, this.namespace);
    return pods[0]?.metadata?.name;
  }

  /**
   * Map Kubernetes pod phase to ContainerStatus
   */
  private mapPodPhaseToStatus(phase: string | undefined): ContainerStatus {
    switch (phase) {
      case 'Pending':
        return ContainerStatus.CREATING;
      case 'Running':
        return ContainerStatus.RUNNING;
      case 'Succeeded':
        return ContainerStatus.SUCCEEDED;
      case 'Failed':
        return ContainerStatus.FAILED;
      case 'Unknown':
      default:
        return ContainerStatus.PENDING;
    }
  }
}
