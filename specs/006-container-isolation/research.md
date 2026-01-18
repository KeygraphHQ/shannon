# Research: Container Isolation for Scans

**Feature**: 006-container-isolation | **Date**: 2026-01-18

## Research Areas

### 1. Kubernetes Client Library for TypeScript

**Decision**: @kubernetes/client-node v1.4.0+

**Rationale**: Official Kubernetes JavaScript client with full TypeScript support. Uses `fetch` as HTTP backend, supports Kubernetes 1.28-1.34, and provides typed APIs for all K8s resources.

**Alternatives Considered**:
- **kubernetes-client/javascript**: Same library, official name
- **Custom REST calls**: Too low-level, requires manual handling of auth, retries
- **Go client via WASM**: Overkill complexity for our use case

**Key Implementation Patterns**:

```typescript
// Authentication (in-cluster via ServiceAccount)
const kc = new k8s.KubeConfig();
kc.loadFromDefault(); // Auto-loads mounted ServiceAccount token

// API clients needed
const coreApi = kc.makeApiClient(k8s.CoreV1Api);      // Pods, ConfigMaps
const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api); // NetworkPolicies

// Create pod
const pod: V1Pod = {
  metadata: { name: `scan-${scanId}`, labels: { 'scan-id': scanId, 'org-id': orgId } },
  spec: { containers: [{ name: 'scanner', image: 'shannon-scanner:v1.0.0' }] }
};
await coreApi.createNamespacedPod('scans', pod);

// Watch pod status
const watch = new k8s.Watch(kc);
watch.watch('/api/v1/namespaces/scans/pods', { labelSelector: `scan-id=${scanId}` },
  (type, obj) => handlePodEvent(type, obj),
  (err) => reconnectWatch()
);
```

**Error Handling Pattern**:
```typescript
try {
  await coreApi.readNamespacedPod(podName, namespace);
} catch (err) {
  if (err.statusCode === 404) return null; // Pod not found
  if (err.statusCode >= 500) throw new TransientError(err); // Retry
  throw new PermanentError(err); // Don't retry
}
```

---

### 2. Cilium FQDN Network Policies

**Decision**: CiliumNetworkPolicy with `toFQDNs` for dynamic target egress

**Rationale**: Cilium's DNS-aware policies automatically resolve hostnames to IPs and update ACLs in real-time. No need for IP pre-resolution or proxy complexity.

**Alternatives Considered**:
- **Pre-resolve IPs + K8s NetworkPolicy**: Fails with CDNs/changing IPs
- **Egress proxy (Envoy/Squid)**: Adds latency and single point of failure
- **iptables per-container**: Complex, not Kubernetes-native

**Policy Template**:

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: scan-{{scanId}}-egress
  namespace: scans
spec:
  endpointSelector:
    matchLabels:
      scan-id: "{{scanId}}"
  egress:
    # 1. DNS resolution (required for toFQDNs to work)
    - toEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: kube-system
            k8s-app: kube-dns
      toPorts:
        - ports:
            - port: "53"
              protocol: UDP

    # 2. Allow target URL (dynamic per scan)
    - toFQDNs:
        - matchName: "{{targetHostname}}"
      toPorts:
        - ports:
            - port: "443"
              protocol: TCP
            - port: "80"
              protocol: TCP

    # 3. Allow Temporal server
    - toFQDNs:
        - matchName: "temporal.shannon-system.svc.cluster.local"
      toPorts:
        - ports:
            - port: "7233"
              protocol: TCP

    # 4. Allow cloud storage (S3/GCS for deliverables)
    - toFQDNs:
        - matchPattern: "*.s3.amazonaws.com"
        - matchPattern: "*.storage.googleapis.com"
      toPorts:
        - ports:
            - port: "443"
              protocol: TCP
```

**Known Limitations**:
- Cannot mix `toFQDNs` with `toCIDRs` in same rule (use separate rules)
- DNS caching respects TTL; old IPs may persist briefly
- Alpine/musl DNS requires `tofqdns-dns-reject-response-code: nameError`
- Max 50 IPs per FQDN per pod (configurable)

**SSRF Protection** (Block cloud metadata):
```yaml
egress:
  - toCIDRSet:
      - cidr: 169.254.0.0/16
        except:
          - 169.254.169.254/32  # Block metadata endpoint
```

---

### 3. Scan Container Image

**Decision**: Extend existing Chainguard Wolfi-based image from `shannon/Dockerfile`

**Rationale**: Current Shannon worker image already includes all required tools (Playwright, nmap, subfinder, whatweb) with security hardening. Extend rather than rebuild.

**Alternatives Considered**:
- **Ubuntu base**: Larger attack surface (~1.5GB vs ~1.1GB)
- **Alpine base**: musl libc issues with Chromium
- **Distroless**: Too minimal for security tools requiring shell

**Current Image Structure** (already implemented):
```dockerfile
# Builder stage: Chainguard Wolfi with Node 22
FROM cgr.dev/chainguard/wolfi-base AS builder
# Installs: Go (subfinder), Ruby (whatweb), Python (schemathesis), nmap

# Runtime stage: Minimal with only required binaries
FROM cgr.dev/chainguard/wolfi-base AS runtime
# Copies: node_modules, compiled tools, Playwright+Chromium
# Security: non-root user (pentest:pentest uid 1001)
```

**Extensions for Isolated Scans**:
1. Add entrypoint that waits for Temporal activity signal
2. Configure S3 upload credentials via environment
3. Set resource-aware heap limits (`NODE_OPTIONS=--max-old-space-size`)

**Image Size**: ~1.0-1.2GB (majority from Chromium ~500MB)

---

### 4. Local Development with Kind

**Decision**: Use Kind (Kubernetes IN Docker) for local container isolation testing

**Rationale**: Kind provides full Kubernetes API compatibility locally, supports Cilium CNI installation, and integrates with existing Docker Compose workflow.

**Alternatives Considered**:
- **Minikube**: Heavier, VM-based on some platforms
- **Docker-only mode**: Loses Kubernetes API compatibility
- **k3s**: Good alternative, but Kind is simpler for CI

**Setup Pattern**:
```bash
# Create cluster with Cilium
kind create cluster --config=kind-config.yaml
helm install cilium cilium/cilium --namespace kube-system \
  --set operator.replicas=1 \
  --set enablePolicy=always

# Load local image
kind load docker-image shannon-scanner:local

# Run integration tests
npm run test:integration:container
```

**Kind Config** (`docker/kind-config.yaml`):
```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
networking:
  disableDefaultCNI: true  # Required for Cilium
```

---

### 5. S3 Presigned URL Pattern

**Decision**: Generate presigned PUT URLs server-side, container uploads directly

**Rationale**: Containers upload deliverables directly to S3 without passing through Shannon service. Presigned URLs are scoped to specific paths and expire after scan timeout.

**Alternatives Considered**:
- **Shared PVC mount**: Complex cleanup, potential cross-tenant access
- **Service proxy**: Bandwidth bottleneck, single point of failure
- **Post-termination extraction**: Risk of data loss if container crashes

**Implementation Pattern**:
```typescript
// Server-side: Generate presigned URL for scan
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function generateDeliverableUploadUrl(orgId: string, scanId: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: 'shannon-deliverables',
    Key: `tenant-${orgId}/scans/${scanId}/report.json`,
    ContentType: 'application/json',
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
}

// Container-side: Upload deliverables
await fetch(presignedUrl, {
  method: 'PUT',
  body: JSON.stringify(deliverables),
  headers: { 'Content-Type': 'application/json' },
});
```

**Security Considerations**:
- URLs scoped to specific `tenant-{orgId}/scans/{scanId}/` paths
- Short expiration (scan timeout + buffer)
- Server-side encryption (SSE-S3 or SSE-KMS)
- Bucket policy enforces tenant prefix validation

---

## Dependencies to Add

```json
{
  "@kubernetes/client-node": "^1.4.0",
  "@aws-sdk/client-s3": "^3.500.0",
  "@aws-sdk/s3-request-presigner": "^3.500.0"
}
```

## Configuration Requirements

| Config Key | Type | Default | Description |
|------------|------|---------|-------------|
| `K8S_NAMESPACE` | string | `scans` | Namespace for scan pods |
| `SCANNER_IMAGE` | string | `shannon-scanner:latest` | Container image for scans |
| `CILIUM_ENABLED` | boolean | `true` | Enable FQDN network policies |
| `S3_BUCKET` | string | required | Deliverables bucket |
| `S3_REGION` | string | `us-east-1` | AWS region |
| `MAX_CONTAINERS_PER_NODE` | number | `50` | Container limit per node |
| `CONTAINER_TIMEOUT_MS` | number | `3600000` | Max scan duration (1 hour) |

## Open Questions (Resolved)

| Question | Resolution | Source |
|----------|-----------|--------|
| K8s client library? | @kubernetes/client-node | Research |
| Dynamic network policy? | Cilium FQDN | Clarification session |
| Container health check? | Temporal heartbeats | Clarification session |
| Deliverable transfer? | S3 presigned URLs | Clarification session |
| Secrets injection? | K8s Secrets | Clarification session |
