# Data Model: Container Isolation for Scans

**Feature**: 006-container-isolation | **Date**: 2026-01-18

## Entity Relationship Diagram

```
┌─────────────────────┐     ┌─────────────────────┐
│       Scan          │     │   Organization      │
│  (from Epic 005)    │────▶│   (from Epic 001)   │
└─────────────────────┘     └─────────────────────┘
         │
         │ 1:1
         ▼
┌─────────────────────┐     ┌─────────────────────┐
│   ScanContainer     │────▶│  ContainerConfig    │
│                     │     │                     │
│ - containerId       │     │ - image             │
│ - podName           │     │ - resourceLimits    │
│ - status            │     │ - networkPolicy     │
│ - startedAt         │     │ - secretRefs        │
│ - terminatedAt      │     └─────────────────────┘
└─────────────────────┘              │
         │                           │
         │ 1:1                       │ contains
         ▼                           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  EphemeralVolume    │     │   ResourceLimits    │
│                     │     │                     │
│ - volumeId          │     │ - cpuCores          │
│ - mountPath         │     │ - memoryMb          │
│ - sizeGb            │     │ - storageMb         │
│ - destroyed         │     │ - networkEgressMbps │
└─────────────────────┘     └─────────────────────┘
         │
         │ 1:*
         ▼
┌─────────────────────┐
│  ContainerMetrics   │
│  (time-series)      │
│                     │
│ - timestamp         │
│ - cpuUsagePercent   │
│ - memoryUsedMb      │
│ - networkTxBytes    │
│ - networkRxBytes    │
└─────────────────────┘
```

## Entities

### ScanContainer

Runtime container executing a scan. Lifecycle managed by Temporal workflow.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Internal reference ID |
| `scanId` | UUID | FK → Scan, unique, not null | Associated scan |
| `organizationId` | UUID | FK → Organization, not null | Tenant isolation key |
| `containerId` | string | K8s-generated, nullable | Docker/containerd container ID |
| `podName` | string | K8s-generated, nullable | Kubernetes pod name |
| `namespace` | string | default: 'scans' | K8s namespace |
| `status` | enum | see below | Lifecycle state |
| `image` | string | not null | Container image reference |
| `imageDigest` | string | nullable | Image SHA256 digest |
| `startedAt` | timestamp | nullable | Container start time |
| `terminatedAt` | timestamp | nullable | Container termination time |
| `exitCode` | integer | nullable | Container exit code (0=success) |
| `errorMessage` | string | nullable | Error details if failed |
| `createdAt` | timestamp | auto-generated | Record creation time |
| `updatedAt` | timestamp | auto-updated | Last modification time |

**Status Enum**:
- `PENDING` - Waiting for container creation
- `CREATING` - Container being provisioned
- `RUNNING` - Container executing scan
- `SUCCEEDED` - Scan completed successfully
- `FAILED` - Scan failed or container crashed
- `TERMINATED` - Container forcefully terminated (timeout/cancellation)
- `CLEANUP` - Container terminated, awaiting resource cleanup

**Indexes**:
- `idx_scan_container_scan_id` on `scanId` (unique)
- `idx_scan_container_org_status` on `(organizationId, status)` for tenant queries
- `idx_scan_container_status_created` on `(status, createdAt)` for cleanup job

---

### ContainerConfig

Configuration for container creation. Immutable after scan starts.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Config reference ID |
| `scanContainerId` | UUID | FK → ScanContainer, unique | Associated container |
| `image` | string | not null | Container image with tag |
| `imageDigest` | string | nullable | Pinned image digest |
| `resourceLimits` | jsonb | not null | CPU/memory/storage limits |
| `networkPolicyName` | string | nullable | CiliumNetworkPolicy name |
| `targetHostname` | string | not null | Allowed egress target |
| `secretRefs` | jsonb | not null | K8s secret references |
| `environmentVars` | jsonb | default: {} | Non-secret env vars |
| `volumeMounts` | jsonb | default: [] | Volume mount configurations |
| `command` | string[] | nullable | Override container command |
| `args` | string[] | nullable | Container arguments |

**resourceLimits Schema**:
```json
{
  "cpu": { "request": "500m", "limit": "2000m" },
  "memory": { "request": "1Gi", "limit": "4Gi" },
  "ephemeralStorage": { "request": "5Gi", "limit": "10Gi" }
}
```

**secretRefs Schema**:
```json
{
  "envFrom": ["shannon-api-keys", "registry-credentials"],
  "volumeMounts": [
    { "name": "anthropic-key", "mountPath": "/secrets/anthropic", "key": "api-key" }
  ]
}
```

---

### ResourceLimits

Plan-based resource allocation. Defines limits per subscription tier.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `planId` | string | PK | Subscription plan identifier |
| `cpuCores` | decimal | min: 0.5, max: 8 | CPU cores limit |
| `memoryMb` | integer | min: 512, max: 16384 | Memory in MB |
| `storageMb` | integer | min: 1024, max: 51200 | Ephemeral storage in MB |
| `networkEgressMbps` | integer | min: 10, max: 1000 | Network egress limit |
| `maxConcurrentContainers` | integer | min: 1, max: 20 | Concurrent scans per org |
| `maxScanDurationMinutes` | integer | min: 10, max: 120 | Scan timeout |

**Default Plans**:

| Plan | CPU | Memory | Storage | Egress | Concurrent | Duration |
|------|-----|--------|---------|--------|------------|----------|
| `free` | 1 | 2048 | 5120 | 100 | 1 | 30 |
| `pro` | 2 | 4096 | 10240 | 500 | 5 | 60 |
| `enterprise` | 4 | 8192 | 20480 | 1000 | 20 | 120 |

---

### NetworkPolicy

Rules governing container egress. Created per-container, deleted on cleanup.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Policy reference ID |
| `scanContainerId` | UUID | FK → ScanContainer, unique | Associated container |
| `policyName` | string | K8s name, unique in namespace | CiliumNetworkPolicy name |
| `namespace` | string | default: 'scans' | K8s namespace |
| `targetHostnames` | string[] | not null | Allowed egress FQDNs |
| `targetPorts` | integer[] | default: [80, 443] | Allowed egress ports |
| `createdAt` | timestamp | auto-generated | Policy creation time |
| `deletedAt` | timestamp | nullable | Policy deletion time |

**Generated CiliumNetworkPolicy Labels**:
```yaml
metadata:
  labels:
    shannon.io/scan-id: "{scanId}"
    shannon.io/org-id: "{organizationId}"
    shannon.io/managed-by: "shannon-container-manager"
```

---

### EphemeralVolume

Temporary storage for scan workspace. Destroyed on container termination.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Volume reference ID |
| `scanContainerId` | UUID | FK → ScanContainer, unique | Associated container |
| `volumeName` | string | K8s name | emptyDir volume name |
| `mountPath` | string | default: '/workspace' | Container mount path |
| `sizeGb` | decimal | min: 1, max: 50 | Volume size limit |
| `storageClass` | string | nullable | K8s StorageClass |
| `destroyed` | boolean | default: false | Volume cleanup status |
| `destroyedAt` | timestamp | nullable | Cleanup timestamp |

---

### ContainerMetrics

Time-series resource usage data. Retained for monitoring and billing.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Metric point ID |
| `scanContainerId` | UUID | FK → ScanContainer, not null | Associated container |
| `timestamp` | timestamp | not null | Metric collection time |
| `cpuUsagePercent` | decimal | 0-100 | CPU utilization |
| `memoryUsedMb` | integer | >= 0 | Memory usage in MB |
| `memoryLimitMb` | integer | >= 0 | Memory limit in MB |
| `networkTxBytes` | bigint | >= 0 | Network bytes transmitted |
| `networkRxBytes` | bigint | >= 0 | Network bytes received |
| `storageUsedMb` | integer | >= 0 | Ephemeral storage used |

**Indexes**:
- `idx_container_metrics_container_time` on `(scanContainerId, timestamp DESC)`
- `idx_container_metrics_time` on `timestamp` for retention cleanup

**Retention**: 30 days (configurable)

---

### ContainerImage

Versioned image metadata. Updated on image builds, referenced by configs.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Image reference ID |
| `repository` | string | not null | Registry/repository path |
| `tag` | string | not null | Image tag (e.g., 'v1.2.3') |
| `digest` | string | unique, not null | SHA256 digest |
| `buildTimestamp` | timestamp | not null | Image build time |
| `gitCommitSha` | string | nullable | Source commit SHA |
| `toolVersions` | jsonb | not null | Embedded tool versions |
| `vulnerabilityScanStatus` | enum | see below | CVE scan status |
| `vulnerabilityScanAt` | timestamp | nullable | Last scan time |
| `isActive` | boolean | default: true | Available for new scans |
| `createdAt` | timestamp | auto-generated | Record creation time |

**toolVersions Schema**:
```json
{
  "node": "22.0.0",
  "playwright": "1.57.0",
  "chromium": "130.0.6723.0",
  "nmap": "7.95",
  "subfinder": "2.6.0",
  "whatweb": "0.5.5"
}
```

**vulnerabilityScanStatus Enum**:
- `PENDING` - Not yet scanned
- `SCANNING` - Scan in progress
- `CLEAN` - No HIGH/CRITICAL CVEs
- `VULNERABLE` - Has HIGH/CRITICAL CVEs
- `FAILED` - Scan failed

---

## State Transitions

### ScanContainer Lifecycle

```
                    ┌─────────────┐
                    │   PENDING   │
                    └──────┬──────┘
                           │ createContainer()
                           ▼
                    ┌─────────────┐
                    │  CREATING   │──────────────┐
                    └──────┬──────┘              │ creation failed
                           │ containerReady()    │
                           ▼                     ▼
                    ┌─────────────┐       ┌─────────────┐
                    │   RUNNING   │       │   FAILED    │
                    └──────┬──────┘       └─────────────┘
                           │                     ▲
         ┌─────────────────┼─────────────────────┤
         │                 │                     │
         │ scanComplete()  │ timeout/cancel      │ crash/OOM
         ▼                 ▼                     │
  ┌─────────────┐   ┌─────────────┐             │
  │  SUCCEEDED  │   │ TERMINATED  │─────────────┘
  └──────┬──────┘   └──────┬──────┘
         │                 │
         └────────┬────────┘
                  │ cleanup()
                  ▼
           ┌─────────────┐
           │   CLEANUP   │
           └─────────────┘
```

### Validation Rules

1. **Unique container per scan**: Each scan has exactly one ScanContainer
2. **Tenant isolation**: All queries filter by `organizationId`
3. **Resource limits required**: ContainerConfig must have valid resourceLimits
4. **Network policy required**: Container cannot start without NetworkPolicy
5. **Image digest preferred**: Production should use digest, not tag alone
6. **Cleanup required**: Terminated containers must transition to CLEANUP within 60s

---

## Prisma Schema Extensions

```prisma
// Add to existing schema.prisma

model ScanContainer {
  id              String   @id @default(uuid())
  scanId          String   @unique
  organizationId  String
  containerId     String?
  podName         String?
  namespace       String   @default("scans")
  status          ContainerStatus @default(PENDING)
  image           String
  imageDigest     String?
  startedAt       DateTime?
  terminatedAt    DateTime?
  exitCode        Int?
  errorMessage    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  scan            Scan     @relation(fields: [scanId], references: [id])
  organization    Organization @relation(fields: [organizationId], references: [id])
  config          ContainerConfig?
  networkPolicy   NetworkPolicy?
  ephemeralVolume EphemeralVolume?
  metrics         ContainerMetrics[]

  @@index([organizationId, status])
  @@index([status, createdAt])
}

enum ContainerStatus {
  PENDING
  CREATING
  RUNNING
  SUCCEEDED
  FAILED
  TERMINATED
  CLEANUP
}

model ContainerConfig {
  id               String   @id @default(uuid())
  scanContainerId  String   @unique
  image            String
  imageDigest      String?
  resourceLimits   Json
  networkPolicyName String?
  targetHostname   String
  secretRefs       Json
  environmentVars  Json     @default("{}")
  volumeMounts     Json     @default("[]")
  command          String[]
  args             String[]

  scanContainer    ScanContainer @relation(fields: [scanContainerId], references: [id])
}

model NetworkPolicy {
  id               String   @id @default(uuid())
  scanContainerId  String   @unique
  policyName       String
  namespace        String   @default("scans")
  targetHostnames  String[]
  targetPorts      Int[]    @default([80, 443])
  createdAt        DateTime @default(now())
  deletedAt        DateTime?

  scanContainer    ScanContainer @relation(fields: [scanContainerId], references: [id])

  @@unique([policyName, namespace])
}

model EphemeralVolume {
  id               String   @id @default(uuid())
  scanContainerId  String   @unique
  volumeName       String
  mountPath        String   @default("/workspace")
  sizeGb           Decimal
  storageClass     String?
  destroyed        Boolean  @default(false)
  destroyedAt      DateTime?

  scanContainer    ScanContainer @relation(fields: [scanContainerId], references: [id])
}

model ContainerMetrics {
  id               String   @id @default(uuid())
  scanContainerId  String
  timestamp        DateTime
  cpuUsagePercent  Decimal
  memoryUsedMb     Int
  memoryLimitMb    Int
  networkTxBytes   BigInt
  networkRxBytes   BigInt
  storageUsedMb    Int

  scanContainer    ScanContainer @relation(fields: [scanContainerId], references: [id])

  @@index([scanContainerId, timestamp(sort: Desc)])
  @@index([timestamp])
}

model ContainerImage {
  id                      String   @id @default(uuid())
  repository              String
  tag                     String
  digest                  String   @unique
  buildTimestamp          DateTime
  gitCommitSha            String?
  toolVersions            Json
  vulnerabilityScanStatus VulnScanStatus @default(PENDING)
  vulnerabilityScanAt     DateTime?
  isActive                Boolean  @default(true)
  createdAt               DateTime @default(now())

  @@unique([repository, tag])
}

enum VulnScanStatus {
  PENDING
  SCANNING
  CLEAN
  VULNERABLE
  FAILED
}

model ResourceLimits {
  planId                   String @id
  cpuCores                 Decimal
  memoryMb                 Int
  storageMb                Int
  networkEgressMbps        Int
  maxConcurrentContainers  Int
  maxScanDurationMinutes   Int
}
```
