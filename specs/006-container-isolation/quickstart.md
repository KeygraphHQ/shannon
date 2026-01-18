# Quickstart: Container Isolation for Scans

**Feature**: 006-container-isolation | **Date**: 2026-01-18

## Prerequisites

- Docker Desktop with Kubernetes enabled (or Kind)
- Node.js 22+
- kubectl configured
- Helm 3.x
- AWS CLI (for S3) or gcloud (for GCS)

## Local Development Setup

### 1. Create Kind Cluster with Cilium

```bash
# Create cluster without default CNI
cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: shannon-dev
nodes:
  - role: control-plane
  - role: worker
    labels:
      shannon.io/node-type: scanner
networking:
  disableDefaultCNI: true
  podSubnet: "10.244.0.0/16"
  serviceSubnet: "10.96.0.0/12"
EOF

# Install Cilium CNI
helm repo add cilium https://helm.cilium.io/
helm install cilium cilium/cilium --namespace kube-system \
  --set operator.replicas=1 \
  --set enablePolicy=always \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true

# Wait for Cilium to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=cilium -n kube-system --timeout=300s
```

### 2. Create Scanner Namespace and RBAC

```bash
# Create namespace
kubectl create namespace scans

# Apply RBAC for scanner service account
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: shannon-scanner
  namespace: scans
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: scanner-role
  namespace: scans
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "pods/status"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["configmaps", "secrets"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: scanner-role-binding
  namespace: scans
subjects:
  - kind: ServiceAccount
    name: shannon-scanner
    namespace: scans
roleRef:
  kind: Role
  name: scanner-role
  apiGroup: rbac.authorization.k8s.io
EOF
```

### 3. Create Secrets

```bash
# Create API key secrets
kubectl create secret generic shannon-api-keys \
  --namespace scans \
  --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"

kubectl create secret generic anthropic-api-key \
  --namespace scans \
  --from-literal=api-key="${ANTHROPIC_API_KEY}"

# Create registry credentials (if using private registry)
kubectl create secret docker-registry registry-credentials \
  --namespace scans \
  --docker-server=your-registry.example.com \
  --docker-username="${REGISTRY_USER}" \
  --docker-password="${REGISTRY_PASSWORD}"
```

### 4. Build and Load Scanner Image

```bash
# Build scanner image
cd shannon
docker build -t shannon-scanner:local -f Dockerfile .

# Load into Kind cluster
kind load docker-image shannon-scanner:local --name shannon-dev
```

### 5. Install Dependencies

```bash
# Install K8s client and AWS SDK
cd shannon
npm install @kubernetes/client-node @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 6. Configure Environment

```bash
# Add to .env
cat >> .env <<EOF

# Container Isolation
K8S_NAMESPACE=scans
SCANNER_IMAGE=shannon-scanner:local
CILIUM_ENABLED=true
S3_BUCKET=shannon-dev-deliverables
S3_REGION=us-east-1
MAX_CONTAINERS_PER_NODE=50
CONTAINER_TIMEOUT_MS=3600000
EOF
```

## Running Tests

### Unit Tests

```bash
# Run container module unit tests
npm run test -- --dir src/container
```

### Integration Tests (Kind Cluster)

```bash
# Ensure Kind cluster is running
kubectl cluster-info --context kind-shannon-dev

# Run integration tests
npm run test:integration -- --dir tests/integration/container

# Test specific scenarios
npm run test:integration -- -t "creates isolated container"
npm run test:integration -- -t "enforces network policy"
npm run test:integration -- -t "cleans up orphaned containers"
```

### Manual Testing

```bash
# Create a test scan container
curl -X POST http://localhost:3000/api/scans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{
    "targetUrl": "https://example.com",
    "scanType": "full"
  }'

# Watch container creation
kubectl get pods -n scans -w

# Check network policy
kubectl get ciliumnetworkpolicies -n scans

# View container logs
kubectl logs -n scans scan-<id> -f

# Verify network isolation
kubectl exec -n scans scan-<id> -- curl -v http://169.254.169.254/  # Should fail
kubectl exec -n scans scan-<id> -- curl -v https://example.com/     # Should succeed
```

## Monitoring

### View Container Metrics

```bash
# Hubble UI (network flows)
kubectl port-forward -n kube-system svc/hubble-ui 12000:80
# Open http://localhost:12000

# Container resource usage
kubectl top pods -n scans

# Cilium metrics
kubectl exec -n kube-system ds/cilium -- cilium status
```

### Check FQDN Policy Cache

```bash
# View DNS cache entries for a pod
kubectl exec -n kube-system ds/cilium -- cilium fqdn cache list -o json
```

## Troubleshooting

### Container Stuck in Pending

```bash
# Check pod events
kubectl describe pod -n scans scan-<id>

# Common issues:
# - Image pull failed: Check registry-credentials secret
# - Insufficient resources: Check node capacity
# - Node selector not matched: Check scanner node labels
```

### Network Policy Not Working

```bash
# Verify Cilium is running
kubectl get pods -n kube-system -l app.kubernetes.io/name=cilium

# Check policy status
kubectl get cnp -n scans
kubectl describe cnp scan-<id>-egress -n scans

# Test DNS resolution
kubectl exec -n scans scan-<id> -- nslookup example.com
```

### Deliverable Upload Failed

```bash
# Test presigned URL from container
kubectl exec -n scans scan-<id> -- curl -v -X PUT "${UPLOAD_URL}" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Check S3 permissions
aws s3 ls s3://shannon-dev-deliverables/tenant-<orgId>/scans/<scanId>/
```

### Cleanup Job Issues

```bash
# Manually trigger cleanup
kubectl exec -n shannon-system deploy/shannon-service -- \
  node -e "require('./dist/container/cleanup-job').runCleanup()"

# Find orphaned containers
kubectl get pods -n scans --field-selector=status.phase!=Running \
  -o custom-columns=NAME:.metadata.name,AGE:.metadata.creationTimestamp
```

## Development Workflow

### 1. Make Changes

Edit files in `shannon/src/container/`:
- `types.ts` - Interface changes
- `kubernetes-client.ts` - K8s API calls
- `container-manager.ts` - Lifecycle management
- `network-policy.ts` - Cilium policy generation

### 2. Build and Test

```bash
# Build TypeScript
npm run build

# Run unit tests
npm run test -- --watch --dir src/container

# Run integration tests
npm run test:integration -- --dir tests/integration/container
```

### 3. Test in Kind

```bash
# Rebuild image
docker build -t shannon-scanner:local -f Dockerfile .
kind load docker-image shannon-scanner:local --name shannon-dev

# Restart worker to pick up changes
kubectl rollout restart deployment/shannon-worker -n shannon-system
```

### 4. Verify

```bash
# Check logs
kubectl logs -n shannon-system deploy/shannon-worker -f

# Run a test scan
./shannon start URL=https://example.com REPO=/tmp/test-repo
```

## Cleanup

```bash
# Delete Kind cluster
kind delete cluster --name shannon-dev

# Remove local images
docker rmi shannon-scanner:local
```

## Next Steps

1. Run `/speckit.tasks` to generate implementation tasks
2. Start with User Story 1 (Isolated Scan Execution)
3. Implement container module skeleton
4. Add Temporal activity integration
5. Write integration tests
