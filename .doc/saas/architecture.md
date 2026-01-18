# Shannon SaaS Solution Architecture

**Version**: 1.1.0
**Date**: 2026-01-18
**Status**: Draft

## Executive Summary

Shannon SaaS is a multi-tenant, AI-powered penetration testing platform that transforms the existing Shannon CLI tool into a cloud-native service. The platform consists of two main packages in a monorepo structure:

- **Shannon**: The AI-powered penetration testing engine (Temporal workflows + Claude Agent SDK)
- **GhostShell**: The web application providing dashboard, reports, and management UI (Next.js + Prisma)

The architecture is designed around **7 constitutional principles** and comprises **8 functional epics**.

---

## System Context

```mermaid
graph TB
    subgraph External["External Actors"]
        Users["Users<br/>(Browser)"]
        CICD["CI/CD<br/>(GitHub)"]
        Targets["Target<br/>Applications"]
        Auditors["Auditors<br/>(Share Links)"]
    end

    subgraph Platform["Shannon SaaS Platform"]
        GhostShell["GhostShell<br/>(Next.js Web App)"]
        Service["Shannon Service<br/>(REST API)"]
        Temporal["Temporal<br/>(Orchestration)"]
        Containers["Scan Containers<br/>(Kubernetes)"]
        DB[(PostgreSQL<br/>ghostshell)]
        Storage[(Object Storage)]
    end

    Users --> GhostShell
    CICD --> GhostShell
    Auditors --> GhostShell
    GhostShell --> Service
    Service --> Temporal
    Temporal --> Containers
    Containers --> Targets
    GhostShell --> DB
    Service --> DB
    Containers --> Storage
```

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Presentation["GhostShell - Presentation Layer"]
        Dashboard["Dashboard<br/>(React 19)"]
        Auth["Authentication<br/>(Clerk)"]
        Public["Public Reports<br/>(Token Access)"]
    end

    subgraph Application["GhostShell - Application Layer"]
        API["Next.js API Routes"]
        Actions["Server Actions"]
        Webhooks["Webhook Handlers<br/>(GitHub, Temporal)"]
    end

    subgraph Service["Shannon - Service Layer (Epic 005)"]
        ShannonAPI["Shannon Service API<br/>/api/v1/*"]
        Health["Health & Metrics<br/>/health, /metrics"]
    end

    subgraph Orchestration["Shannon - Orchestration Layer"]
        TemporalServer["Temporal Server"]
        PentestWorkflow["Pentest Workflow"]
        ReportWorkflow["Report Workflow"]
        ScheduleWorkflow["Schedule Triggers"]
    end

    subgraph Execution["Shannon - Execution Layer (Epic 006)"]
        K8s["Kubernetes"]
        Container1["Scan Container<br/>(Tenant A)"]
        Container2["Scan Container<br/>(Tenant B)"]
        Container3["Scan Container<br/>(Tenant C)"]
    end

    subgraph Data["Data Layer"]
        Postgres[(PostgreSQL<br/>ghostshell DB)]
        S3[(S3/Blob<br/>Storage)]
        Redis[(Redis<br/>Cache)]
    end

    Dashboard --> API
    Auth --> API
    Public --> API
    API --> Actions
    Actions --> ShannonAPI
    Webhooks --> ShannonAPI
    ShannonAPI --> TemporalServer
    Health --> TemporalServer
    TemporalServer --> PentestWorkflow
    TemporalServer --> ReportWorkflow
    TemporalServer --> ScheduleWorkflow
    PentestWorkflow --> K8s
    K8s --> Container1
    K8s --> Container2
    K8s --> Container3
    Actions --> Postgres
    ShannonAPI --> Postgres
    Container1 --> S3
    Container2 --> S3
    Container3 --> S3
    API --> Redis
```

---

## Component Architecture

### GhostShell - Web Application Layer

```mermaid
graph LR
    subgraph NextJS["GhostShell (Next.js 16)"]
        subgraph Routes["App Router"]
            AuthRoutes["(auth)/*<br/>Sign-in, Sign-up, 2FA"]
            DashRoutes["(dashboard)/*<br/>Scans, Findings, Reports"]
            APIRoutes["api/*<br/>REST Endpoints"]
        end

        subgraph Components["React Components"]
            UI["UI Primitives<br/>(Tailwind CSS 4)"]
            Scans["Scan Components"]
            Findings["Finding Components"]
            Reports["Report Components"]
        end

        subgraph Lib["Library"]
            Actions["Server Actions"]
            DB["Prisma Client"]
            ShannonClient["Shannon API Client"]
            Audit["Audit Logging"]
        end
    end

    subgraph External["External Services"]
        Clerk["Clerk Auth"]
        Resend["Resend Email"]
    end

    AuthRoutes --> Clerk
    DashRoutes --> Components
    APIRoutes --> Actions
    Actions --> DB
    Actions --> ShannonClient
    Actions --> Audit
    Actions --> Resend
```

### Shannon Service Layer (Epic 005)

```mermaid
graph TB
    subgraph ServiceAPI["Shannon Service REST API"]
        subgraph Endpoints["Endpoints"]
            Scans["/api/v1/scans<br/>POST, GET, DELETE"]
            Progress["/api/v1/scans/{id}/progress<br/>GET (SSE)"]
            AuthVal["/api/v1/auth/validate<br/>POST"]
            Config["/api/v1/config/*<br/>GET"]
            Reports["/api/v1/reports<br/>POST, GET"]
        end

        subgraph Health["Health & Monitoring"]
            HealthCheck["/health<br/>Liveness"]
            Ready["/health/ready<br/>Readiness"]
            Metrics["/metrics<br/>Prometheus"]
        end
    end

    subgraph Dependencies["Dependencies"]
        TemporalClient["Temporal Client"]
        Database[(PostgreSQL)]
        Cache[(Redis)]
    end

    Scans --> TemporalClient
    Progress --> TemporalClient
    AuthVal --> TemporalClient
    Scans --> Database
    Reports --> Database
    HealthCheck --> TemporalClient
    HealthCheck --> Database
    Config --> Cache
```

### Container Execution Layer (Epic 006)

```mermaid
graph TB
    subgraph Kubernetes["Kubernetes Cluster"]
        subgraph ControlPlane["Control Plane"]
            Scheduler["Scheduler"]
            Controller["Container Controller"]
            NetworkPolicy["Network Policy<br/>Controller"]
        end

        subgraph ScanNamespace["shannon-scans Namespace"]
            subgraph Pod1["Scan Pod (Tenant A)"]
                Agent1["Shannon Agent"]
                Playwright1["Playwright"]
                Tools1["Security Tools"]
            end

            subgraph Pod2["Scan Pod (Tenant B)"]
                Agent2["Shannon Agent"]
                Playwright2["Playwright"]
                Tools2["Security Tools"]
            end

            ResourceQuota["Resource Quota<br/>per Tenant"]
            NetPol["Network Policy<br/>Egress Only"]
        end

        subgraph Storage["Ephemeral Storage"]
            Vol1["Volume A<br/>/workspace"]
            Vol2["Volume B<br/>/workspace"]
        end
    end

    subgraph Targets["External Targets"]
        Target1["target-a.com"]
        Target2["target-b.com"]
    end

    Controller --> Pod1
    Controller --> Pod2
    NetworkPolicy --> NetPol
    Pod1 --> Vol1
    Pod2 --> Vol2
    Pod1 -.->|"Allowed"| Target1
    Pod2 -.->|"Allowed"| Target2
    Pod1 -.->|"Blocked"| Pod2
```

---

## Data Model

```mermaid
erDiagram
    Organization ||--o{ User : "has members"
    Organization ||--o{ Project : "owns"
    Organization ||--o{ AuditLog : "tracks"
    Organization ||--o{ Report : "generates"
    Organization ||--o{ ReportTemplate : "customizes"
    Organization ||--o{ APIKey : "owns"
    Organization ||--o{ ReportJob : "generates"

    User ||--o{ OrganizationMembership : "belongs to"
    OrganizationMembership }o--|| Organization : "member of"

    Project ||--o{ Scan : "runs"
    Project ||--o| AuthenticationConfig : "configures"
    Project ||--o{ ScanSchedule : "schedules"
    Project ||--o{ CICDIntegration : "integrates"

    Scan ||--o| ScanResult : "produces"
    Scan ||--o{ Finding : "discovers"
    Scan ||--o{ Report : "generates"
    Scan ||--o{ ReportJob : "generates"
    Scan ||--o| Scan : "retries"
    Scan ||--o| ScanContainer : "executes in"

    APIKey ||--o{ Scan : "initiates"

    ScanContainer ||--o| EphemeralVolume : "mounts"
    ScanContainer ||--o| NetworkPolicy : "applies"

    Finding ||--o{ FindingNote : "has"
    Finding ||--o{ ComplianceMapping : "maps to"

    Report ||--o{ ReportShare : "shared via"
    Report ||--o{ ReportAccessLog : "accessed"

    Organization {
        string id PK
        string name
        string slug
        string plan
        datetime createdAt
    }

    User {
        string id PK
        string email
        string name
        boolean twoFactorEnabled
    }

    Project {
        string id PK
        string organizationId FK
        string name
        string targetUrl
        string repositoryUrl
    }

    Scan {
        string id PK
        string projectId FK
        string status
        string source
        string temporalWorkflowId
        int progressPercent
        int findingsCount
        string parentScanId FK
        string apiKeyId FK
        datetime queuedAt
    }

    APIKey {
        string id PK
        string organizationId FK
        string name
        string keyPrefix
        string keyHash
        string[] scopes
        datetime expiresAt
        datetime revokedAt
    }

    ReportJob {
        string id PK
        string scanId FK
        string organizationId FK
        string format
        string status
        int progress
        string outputPath
    }

    ScanContainer {
        string id PK
        string scanId FK
        string podName
        string status
        string cpuLimit
        string memoryLimit
        string storageLimit
        datetime startedAt
        datetime terminatedAt
    }

    EphemeralVolume {
        string id PK
        string containerId FK
        string mountPath
        string sizeLimit
        boolean destroyed
    }

    NetworkPolicy {
        string id PK
        string containerId FK
        string targetFqdn
        string[] allowedEgress
        string[] blockedRanges
    }

    Finding {
        string id PK
        string scanId FK
        string title
        string severity
        string status
        string category
        string cwe
        float cvss
    }

    Report {
        string id PK
        string scanId FK
        string type
        string status
        int riskScore
        string storagePath
    }
```

---

## Security Architecture

### Multi-Tenant Isolation

```mermaid
graph TB
    subgraph TenantA["Tenant A Boundary"]
        A_Data["Database<br/>organizationId = A"]
        A_Storage["Storage<br/>tenant-A/*"]
        A_Container["Containers<br/>Network Isolated"]
        A_Temporal["Temporal<br/>Namespace: tenant-A"]
    end

    subgraph TenantB["Tenant B Boundary"]
        B_Data["Database<br/>organizationId = B"]
        B_Storage["Storage<br/>tenant-B/*"]
        B_Container["Containers<br/>Network Isolated"]
        B_Temporal["Temporal<br/>Namespace: tenant-B"]
    end

    subgraph Enforcement["Isolation Enforcement"]
        RLS["Row-Level Security<br/>(Prisma Middleware)"]
        NetPol["Network Policies<br/>(Kubernetes)"]
        IAM["Storage IAM<br/>(Prefix-based)"]
    end

    RLS --> A_Data
    RLS --> B_Data
    NetPol --> A_Container
    NetPol --> B_Container
    IAM --> A_Storage
    IAM --> B_Storage

    A_Container -.->|"BLOCKED"| B_Container
    A_Data -.->|"BLOCKED"| B_Data
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Clerk
    participant NextJS
    participant Database

    User->>Browser: Access Dashboard
    Browser->>NextJS: GET /dashboard
    NextJS->>Clerk: Validate Session

    alt No Session
        Clerk-->>Browser: Redirect to /sign-in
        User->>Clerk: OAuth / Email+Password
        Clerk->>Clerk: Verify Credentials
        opt 2FA Enabled
            Clerk->>User: Request TOTP
            User->>Clerk: Enter TOTP
        end
        Clerk-->>Browser: Set Session Cookie
        Browser->>NextJS: GET /dashboard (with session)
    end

    Clerk-->>NextJS: User + Org Context
    NextJS->>Database: Query with organizationId filter
    Database-->>NextJS: Tenant-scoped data
    NextJS-->>Browser: Render Dashboard
```

### Credential Encryption

```mermaid
flowchart LR
    subgraph Input["User Input"]
        Credentials["Auth Credentials<br/>(username, password, token)"]
    end

    subgraph Encryption["Encryption Process"]
        MasterKey["ENCRYPTION_MASTER_KEY<br/>(Environment Variable)"]
        OrgId["Organization ID"]
        HMAC["HMAC-SHA256"]
        DerivedKey["Org-Specific Key"]
        AES["AES-256-GCM"]
    end

    subgraph Storage["Database Storage"]
        Encrypted["encryptedCredentials<br/>{iv}:{authTag}:{ciphertext}"]
    end

    MasterKey --> HMAC
    OrgId --> HMAC
    HMAC --> DerivedKey
    Credentials --> AES
    DerivedKey --> AES
    AES --> Encrypted
```

---

## Scan Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant WebApp
    participant Service
    participant Temporal
    participant K8s
    participant Container
    participant Target

    User->>WebApp: Start Scan
    WebApp->>Service: POST /api/v1/scans
    Service->>Service: Check concurrent limit (3/org)
    Service->>Temporal: Start pentestPipelineWorkflow
    Temporal-->>Service: Workflow ID
    Service-->>WebApp: Scan ID + Workflow ID
    WebApp-->>User: Show Progress UI

    Temporal->>K8s: Create Scan Pod
    K8s->>Container: Start Container

    loop 5-Phase Execution
        Container->>Target: Pre-Recon (nmap, subfinder)
        Container->>Container: Code Analysis (Claude SDK)
        Container->>Target: Vulnerability Scan (5 agents)
        Container->>Target: Exploitation (5 agents)
        Container->>Container: Generate Report
        Container->>Temporal: Heartbeat + Progress
        Temporal->>WebApp: Progress Update (SSE)
        WebApp->>User: Update UI
    end

    Container->>Temporal: Complete with Results
    Temporal->>K8s: Terminate Pod
    K8s->>Container: SIGTERM → Cleanup
    Temporal->>Service: Workflow Complete
    Service->>WebApp: Scan Complete Webhook
    WebApp->>User: Show Results
```

---

## Infrastructure Deployment

```mermaid
graph TB
    subgraph Cloud["Cloud Provider (AWS/GCP)"]
        subgraph Network["VPC"]
            subgraph Public["Public Subnet"]
                LB["Load Balancer"]
                CDN["CDN / WAF"]
            end

            subgraph Private["Private Subnet"]
                subgraph K8sCluster["Kubernetes Cluster"]
                    WebPods["Web App Pods<br/>(3 replicas)"]
                    ServicePods["Service Pods<br/>(3 replicas)"]
                    TemporalPods["Temporal<br/>(StatefulSet)"]
                    WorkerPods["Workers<br/>(5 replicas)"]
                    ScanPods["Scan Pods<br/>(Dynamic)"]
                end
            end

            subgraph Data["Data Subnet"]
                RDS[(PostgreSQL<br/>RDS/CloudSQL)]
                ElastiCache[(Redis<br/>ElastiCache)]
            end
        end

        S3[(S3 / GCS<br/>Object Storage)]
        ECR["Container Registry<br/>ECR / Artifact Registry"]
    end

    subgraph External["External Services"]
        Clerk["Clerk<br/>(Auth)"]
        Resend["Resend<br/>(Email)"]
        GitHub["GitHub<br/>(Webhooks)"]
    end

    CDN --> LB
    LB --> WebPods
    WebPods --> ServicePods
    ServicePods --> TemporalPods
    TemporalPods --> WorkerPods
    WorkerPods --> ScanPods
    WebPods --> RDS
    ServicePods --> RDS
    WebPods --> ElastiCache
    ScanPods --> S3
    WorkerPods --> ECR
    WebPods --> Clerk
    WebPods --> Resend
    WebPods --> GitHub
```

---

## Epic Dependencies

```mermaid
graph TD
    E001["Epic 001<br/>Onboarding & Setup<br/>✅ COMPLETE"]
    E002["Epic 002<br/>Security Scans<br/>🔄 IN PROGRESS"]
    E003["Epic 003<br/>Findings & Remediation<br/>🔄 IN PROGRESS"]
    E004["Epic 004<br/>Reporting & Compliance<br/>🔄 IN PROGRESS"]
    E005["Epic 005<br/>Shannon Service<br/>📋 SPECIFIED"]
    E006["Epic 006<br/>Container Isolation<br/>📋 SPECIFIED"]
    E007["Epic 007<br/>Monorepo Restructure<br/>✅ COMPLETE"]
    E008["Epic 008<br/>Monorepo Testing<br/>✅ COMPLETE"]
    E009["Epic 009<br/>Billing & Subscriptions<br/>⏳ PLANNED"]

    E001 --> E002
    E002 --> E003
    E002 --> E004
    E002 --> E005
    E005 --> E006
    E001 --> E007
    E007 --> E008
    E001 --> E009

    style E001 fill:#22c55e
    style E002 fill:#eab308
    style E003 fill:#eab308
    style E004 fill:#eab308
    style E005 fill:#3b82f6
    style E006 fill:#3b82f6
    style E007 fill:#22c55e
    style E008 fill:#22c55e
    style E009 fill:#6b7280
```

---

## Resource Limits by Plan

```mermaid
graph LR
    subgraph Free["Free Tier"]
        F_CPU["1 CPU"]
        F_MEM["2 GB RAM"]
        F_TIME["30 min max"]
        F_CONC["1 concurrent"]
        F_TEAM["1 member"]
    end

    subgraph Pro["Pro Tier"]
        P_CPU["2 CPU"]
        P_MEM["4 GB RAM"]
        P_TIME["60 min max"]
        P_CONC["3 concurrent"]
        P_TEAM["5 members"]
    end

    subgraph Enterprise["Enterprise Tier"]
        E_CPU["4 CPU"]
        E_MEM["8 GB RAM"]
        E_TIME["120 min max"]
        E_CONC["10 concurrent"]
        E_TEAM["Unlimited"]
    end
```

---

## Implementation Status

| Epic | Description | Status |
|------|-------------|--------|
| 001-onboarding-setup | Authentication, organization, team management | ✅ Complete |
| 002-security-scans | Quick scan, authenticated testing, scheduling, CI/CD | 🔄 In Progress |
| 003-findings-remediation | Finding detail, notes, filtering, bulk updates | 🔄 In Progress |
| 004-reporting-compliance | Reports, compliance mapping, sharing, scheduling | 🔄 In Progress |
| 005-shannon-service | Shannon REST API service layer | 📋 Specified |
| 006-container-isolation | Per-scan container sandboxing | 📋 Specified |
| 007-monorepo-restructure | Shannon/GhostShell separation, DB rename | ✅ Complete |
| 008-monorepo-testing | Vitest testing infrastructure | ✅ Complete |
| 009-billing | Stripe integration, subscriptions | ⏳ Planned |

**Legend:** ✅ Complete | 🔄 In Progress | 📋 Specified | ⏳ Planned

---

## Constitution Principles

| # | Principle | Key Requirements |
|---|-----------|------------------|
| I | Security-First | OWASP Top 10, encryption at rest, TLS 1.3, audit logging |
| II | AI-Native Architecture | Claude Agent SDK, max autonomy, cost tracking |
| III | Multi-Tenant Isolation | RLS, tenant namespaces, storage prefixes |
| IV | Temporal-First | All long-running ops as workflows, heartbeats, queryable |
| V | Progressive Delivery | Prioritized stories, independent testing, feature flags |
| VI | Observability-Driven | Structured logs, Prometheus metrics, OpenTelemetry |
| VII | Simplicity | YAGNI, managed services, minimal abstractions |

---

## Monorepo Structure

```
shannon/                  # Penetration testing engine (Temporal + Claude Agent SDK)
├── src/                  # Core application source
├── configs/              # YAML configuration files
├── prompts/              # AI prompt templates
├── docker/               # Docker-related files
├── mcp-server/           # MCP server implementation
├── __tests__/            # Shannon package tests
└── package.json          # Shannon package dependencies

ghostshell/               # Web application (Next.js + Prisma)
├── app/                  # Next.js app router
├── components/           # React components
├── lib/                  # Utilities and business logic
├── prisma/               # Database schema and migrations
├── __tests__/            # GhostShell package tests
└── package.json          # GhostShell package dependencies

specs/                    # Feature specifications
├── 001-onboarding-setup/
├── 002-security-scans/
├── 003-findings-remediation/
├── 004-reporting-compliance/
├── 005-shannon-service/
├── 006-container-isolation/
├── 007-monorepo-restructure/
└── 008-setup-monorepo-testing/

docker-compose.yml        # Orchestrates all services
package.json              # Workspace root configuration
vitest.workspace.ts       # Shared test configuration
```

---

## Next Steps

1. **Complete Epic 002** - Scheduled Scans (US4) and CI/CD Integration (US5)
2. **Complete Epic 003** - Final polish tasks
3. **Complete Epic 004** - Sharing, Scheduling, Dashboard, Templates
4. **Plan Epic 005** - Run `/speckit.plan specs/005-shannon-service`
5. **Plan Epic 006** - Run `/speckit.plan specs/006-container-isolation`
6. **Create Epic 009** - Billing & Subscription management
