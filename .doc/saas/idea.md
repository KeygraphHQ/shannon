# Shannon SaaS - Plano de Transformação

**Versão:** 1.1
**Data:** 2026-01-18
**Autor:** Claude Code Analysis
**Status:** Em Implementação

> **Nota de Atualização (2026-01-18):** O projeto foi reestruturado como monorepo com dois pacotes:
> - **Shannon** (`/shannon`): Motor de pentest AI (Temporal + Claude Agent SDK)
> - **GhostShell** (`/ghostshell`): Aplicação web Next.js (database: `ghostshell`)
>
> A infraestrutura de testes foi implementada com Vitest e Testing Library. Ver `specs/007-monorepo-restructure` e `specs/008-setup-monorepo-testing` para detalhes.

---

## Sumário Executivo

Este documento apresenta o plano completo para transformar o Shannon de uma ferramenta CLI de penetration testing em um SaaS self-service. A transformação visa democratizar security testing, tornando-o acessível para equipes de desenvolvimento que não possuem expertise em segurança ofensiva.

**Complexidade Geral:** ALTA (8/10)
**Esforço Estimado:** 6-9 meses para MVP (equipe de 3-4 desenvolvedores)
**Investimento Inicial:** $50k-$80k (infra + desenvolvimento)
**Mercado-Alvo:** Startups e empresas de médio porte (50-500 funcionários)

---

## 1. Análise de Complexidade

### 1.1 Avaliação por Área

| Área | Complexidade | Esforço | Justificativa |
|------|--------------|---------|---------------|
| **Backend API** | 🟡 Média-Alta | 6-8 semanas | Criar REST/GraphQL API, adaptar Temporal para multi-tenancy |
| **Frontend** | 🟡 Média | 8-10 semanas | Dashboard completo, visualização de scans, relatórios interativos |
| **Autenticação & Multi-tenancy** | 🟠 Alta | 3-4 semanas | Isolamento de dados, RBAC, organizações |
| **Billing & Subscriptions** | 🟡 Média | 3-4 semanas | Stripe integration, metering, plans |
| **Storage & Database** | 🟡 Média | 2-3 semanas | PostgreSQL para metadata, S3 para reports |
| **Infrastructure & DevOps** | 🔴 Muito Alta | 4-6 semanas | Kubernetes, scaling, monitoring |
| **Security & Compliance** | 🔴 Muito Alta | Contínuo | SOC2, penetration testing de pentest tool |
| **Testing & QA** | 🟡 Média | 2-3 semanas | Unit, integration, E2E tests |

**Total Estimado:** 6-9 meses para MVP completo

### 1.2 Riscos Identificados

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| **Workers sobrecarregados** | Alto | Média | Auto-scaling + queue backpressure |
| **LLM API outages** | Alto | Baixa | Retry com exponential backoff, fallback providers |
| **Tenant data leakage** | Crítico | Baixa | Security audits, E2E tests multi-tenant |
| **Billing fraud** | Médio | Média | Stripe fraud detection, usage caps |
| **Workers maliciosos** | Alto | Baixa | Sandboxing, seccomp, network policies |

---

## 2. Funcionalidades SaaS Necessárias

### 2.1 Core Authentication & Authorization

#### User Management
- ✅ Sign up / Login (email + password, OAuth Google/GitHub)
- ✅ Email verification
- ✅ Password reset flow
- ✅ Multi-Factor Authentication (TOTP)
- ✅ Session management
- ✅ API keys para integração programática

#### Multi-Tenancy
- ✅ Organizations/Workspaces (1 user pode ter múltiplas orgs)
- ✅ Team management (invite members, roles)
- ✅ RBAC (Role-Based Access Control):
  - **Owner**: Full control
  - **Admin**: Manage scans, view billing
  - **Member**: Run scans, view reports
  - **Viewer**: Read-only access

#### Isolation & Security
- ✅ Tenant-scoped data (todos os queries têm tenantId)
- ✅ Network isolation para workers (1 namespace Temporal por tenant)
- ✅ Audit logs por tenant
- ✅ Rate limiting por tenant

---

### 2.2 Project & Scan Management

#### Projects
- ✅ CRUD projects (name, description, targets)
- ✅ Project-scoped configurations (auth, rules)
- ✅ Target URLs management (add/remove/edit)
- ✅ Repository integration (GitHub, GitLab, Bitbucket)
- ✅ Configuration templates (OWASP Juice Shop, Metabase, etc.)

#### Scans
- ✅ Start scan (URL + config)
- ✅ Scheduled scans (cron-like)
- ✅ Scan queue management
- ✅ Cancel/pause/resume scan
- ✅ Scan history (todas as execuções)
- ✅ Scan comparison (diff between runs)

#### Real-Time Progress
- ✅ WebSocket connection para live updates
- ✅ Phase tracking (pre-recon, recon, vuln, exploit, report)
- ✅ Agent status (queued, running, completed, failed)
- ✅ Live logs streaming
- ✅ ETA calculation

---

### 2.3 Reports & Findings

#### Findings Management
- ✅ View all findings (vulnerabilities discovered)
- ✅ Filter by severity (critical, high, medium, low, info)
- ✅ Filter by type (injection, XSS, auth, authz, SSRF)
- ✅ Filter by status (open, in-review, false-positive, fixed)
- ✅ Assign findings to team members
- ✅ Add comments/notes to findings
- ✅ Export findings (CSV, JSON, PDF)

#### Reports
- ✅ Interactive report viewer (HTML)
- ✅ Executive summary dashboard
- ✅ Technical details view (code snippets, payloads, evidence)
- ✅ Remediation recommendations
- ✅ Download reports (PDF, HTML, Markdown)
- ✅ Share reports (public links com expiration)
- ✅ Report templates customization

#### Metrics & Analytics
- ✅ Security posture over time
- ✅ Vulnerability trends (new vs fixed)
- ✅ MTTR (Mean Time To Remediate)
- ✅ Compliance dashboards (OWASP Top 10, CWE)

---

### 2.4 Billing & Subscriptions

#### Plans
- ✅ **Free Tier**:
  - 1 project, 5 scans/month, basic reports
- ✅ **Pro**:
  - $99/month, 10 projects, unlimited scans, advanced reports
- ✅ **Enterprise**:
  - Custom pricing, unlimited everything, SLA, priority support

#### Usage Metering
- ✅ Track scans executed
- ✅ Track agent turns consumed
- ✅ Track LLM costs (pass-through or margin)
- ✅ Usage dashboard (current month vs limit)
- ✅ Overage alerts

#### Payment
- ✅ Stripe integration (credit card, ACH)
- ✅ Invoicing (auto-generated monthly)
- ✅ Payment history
- ✅ Failed payment handling

---

### 2.5 Integrations & APIs

#### Public API
- ✅ REST API (GraphQL opcional)
- ✅ API documentation (Swagger/OpenAPI)
- ✅ API keys management
- ✅ Rate limiting (per API key)
- ✅ Webhooks (scan.completed, finding.created)

#### CI/CD Integration
- ✅ GitHub Actions
- ✅ GitLab CI
- ✅ Jenkins
- ✅ CircleCI

#### Ticketing Integration
- ✅ Jira (create tickets from findings)
- ✅ Linear
- ✅ GitHub Issues

#### Notifications
- ✅ Email (scan completed, new critical finding)
- ✅ Slack
- ✅ Discord
- ✅ PagerDuty (critical findings)

---

### 2.6 Admin & Operations

#### Admin Dashboard
- ✅ User management (view all users, impersonate)
- ✅ Organization management
- ✅ Scan queue monitoring (global view)
- ✅ Worker health monitoring
- ✅ Resource usage (CPU, memory, disk)
- ✅ Error tracking (Sentry integration)

#### Feature Flags
- ✅ Enable/disable features per tenant
- ✅ A/B testing
- ✅ Gradual rollouts

#### Support
- ✅ In-app chat (Intercom, Crisp)
- ✅ Ticket system
- ✅ Knowledge base

---

## 3. Arquitetura SaaS Proposta

### 3.1 Stack Tecnológico

#### Frontend
```typescript
- Framework: Next.js 14 (App Router, RSC)
- UI: shadcn/ui + Tailwind CSS
- State: Zustand (local) + React Query (server state)
- Real-time: Socket.io client
- Charts: Recharts ou Chart.js
- Code Viewer: Monaco Editor (para código vulnerável)
- Markdown: react-markdown (para reports)
```

#### Backend
```typescript
- Framework: NestJS (TypeScript, modular, escalável)
- API Style: REST + GraphQL (Opcional, Apollo)
- Validation: Zod ou class-validator
- Authentication: Passport.js + JWT
- Authorization: CASL (attribute-based access control)
```

#### Database & Storage
```typescript
- Primary DB: PostgreSQL 15+ (metadata, users, scans)
- ORM: Prisma (type-safe, migrations)
- Cache: Redis (sessions, rate limiting)
- Object Storage: AWS S3 ou MinIO (reports, deliverables)
- Search: Typesense (findings search)
```

#### Orchestration (Manter Temporal!)
```typescript
- Temporal: 1.24+ (workflows já existem)
- Temporal Cloud: Para produção (managed, mais fácil de escalar)
- Temporal Namespaces: 1 por tenant (isolamento)
```

#### Infrastructure
```typescript
- Containers: Docker + Kubernetes (EKS, GKE, ou AKS)
- API Gateway: Kong ou Traefik
- Load Balancer: NGINX Ingress
- Monitoring: Grafana + Prometheus
- Logging: Loki ou ELK Stack
- Tracing: Jaeger ou Tempo
- Errors: Sentry
```

#### DevOps & CI/CD
```typescript
- IaC: Terraform
- CI/CD: GitHub Actions
- Secrets: Vault ou AWS Secrets Manager
- Container Registry: Docker Hub ou ECR
```

---

### 3.2 Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS (Browser)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CDN (CloudFlare)                             │
│  - Static assets caching                                        │
│  - DDoS protection                                              │
│  - SSL termination                                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Load Balancer (NGINX)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
            ▼                             ▼
┌──────────────────────┐      ┌──────────────────────┐
│   Next.js Frontend   │      │   NestJS Backend     │
│   (Vercel/K8s)       │      │   API (K8s Pods)     │
│                      │      │                      │
│  - SSR/SSG pages     │◄─────┤  - REST/GraphQL API  │
│  - Real-time UI      │      │  - Auth/RBAC         │
│  - Dashboard         │      │  - Business logic    │
└──────────────────────┘      └──────┬───────────────┘
            │                        │
            │ WebSocket              │
            ▼                        │
┌──────────────────────┐             │
│   Socket.io Server   │             │
│   (Real-time)        │             │
└──────────────────────┘             │
                                     │
                        ┌────────────┼────────────┐
                        │            │            │
                        ▼            ▼            ▼
            ┌──────────────┐  ┌──────────┐  ┌──────────────┐
            │  PostgreSQL  │  │  Redis   │  │  S3/MinIO    │
            │              │  │          │  │              │
            │  - Users     │  │  - Cache │  │  - Reports   │
            │  - Orgs      │  │  - Queue │  │  - Deliverables│
            │  - Scans     │  │  - Sessions│ │  - Logs      │
            │  - Findings  │  └──────────┘  └──────────────┘
            └──────────────┘
                        │
                        │
                        ▼
            ┌──────────────────────────────────────────┐
            │        Temporal (Multi-Tenant)            │
            │                                           │
            │  Namespace: tenant-123                   │
            │  ├─ Workflow: pentest-scan-456           │
            │  │  ├─ Activity: runPreReconAgent        │
            │  │  ├─ Activity: runReconAgent           │
            │  │  └─ Activity: runVulnAgents (5x)      │
            │                                           │
            │  Namespace: tenant-789                   │
            │  └─ Workflow: pentest-scan-790           │
            └──────────────┬───────────────────────────┘
                           │
                           │ (1 Worker Pool per Tenant)
                           │
                           ▼
            ┌──────────────────────────────────────────┐
            │     Worker Pool (K8s StatefulSet)        │
            │                                           │
            │  ┌──────────────────────────────────┐    │
            │  │  Worker Pod 1 (tenant-123)       │    │
            │  │  - Claude Agent SDK              │    │
            │  │  - Playwright MCP (5 instances)  │    │
            │  │  - Resource limits (CPU/RAM)     │    │
            │  └──────────────────────────────────┘    │
            │                                           │
            │  ┌──────────────────────────────────┐    │
            │  │  Worker Pod 2 (tenant-789)       │    │
            │  │  - Isolated execution            │    │
            │  │  - Separate Chromium instances   │    │
            │  └──────────────────────────────────┘    │
            └───────────────────────────────────────────┘
                           │
                           │ Audit Logs
                           ▼
            ┌──────────────────────────────────────────┐
            │         Observability Stack              │
            │                                           │
            │  - Grafana (metrics dashboards)          │
            │  - Prometheus (metrics collection)       │
            │  - Loki (log aggregation)                │
            │  - Tempo (distributed tracing)           │
            │  - Sentry (error tracking)               │
            └───────────────────────────────────────────┘
```

---

### 3.3 Database Schema (PostgreSQL)

```sql
-- Users & Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255),
  avatar_url VARCHAR(500),
  email_verified BOOLEAN DEFAULT FALSE,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Organizations (Multi-tenancy)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free', -- free, pro, enterprise
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Organization Members (RBAC)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- owner, admin, member, viewer
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_url VARCHAR(500),
  repository_url VARCHAR(500),
  config JSONB, -- Shannon config (auth, rules, etc.)
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scans
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id VARCHAR(255) UNIQUE NOT NULL, -- Temporal workflow ID
  status VARCHAR(50) NOT NULL, -- queued, running, completed, failed, cancelled
  current_phase VARCHAR(100),
  current_agent VARCHAR(100),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_cost_usd NUMERIC(10, 4),
  total_duration_ms INTEGER,
  total_turns INTEGER,
  error TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Findings (Vulnerabilities)
CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL, -- injection, xss, auth, authz, ssrf
  severity VARCHAR(50) NOT NULL, -- critical, high, medium, low, info
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  remediation TEXT,
  evidence JSONB, -- { url, payload, response, screenshot }
  status VARCHAR(50) DEFAULT 'open', -- open, in-review, false-positive, fixed
  assigned_to UUID REFERENCES users(id),
  cwe_id VARCHAR(50), -- CWE-89, CWE-79, etc.
  owasp_category VARCHAR(100), -- A01:2021-Broken Access Control
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Finding Comments
CREATE TABLE finding_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID REFERENCES findings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reports (S3 references)
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  format VARCHAR(50) NOT NULL, -- pdf, html, markdown, json
  s3_key VARCHAR(500) NOT NULL, -- S3 object key
  file_size_bytes INTEGER,
  is_public BOOLEAN DEFAULT FALSE,
  public_token VARCHAR(255) UNIQUE, -- For public sharing
  expires_at TIMESTAMP, -- For expiring public links
  created_at TIMESTAMP DEFAULT NOW()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) UNIQUE NOT NULL, -- Hashed API key
  last_used_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL, -- scan.created, finding.updated, etc.
  resource_type VARCHAR(100), -- scan, finding, project, etc.
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usage Metrics (for billing)
CREATE TABLE usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  metric_type VARCHAR(100) NOT NULL, -- scans_executed, agent_turns, llm_cost
  metric_value NUMERIC(10, 4),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_scans_organization_id ON scans(organization_id);
CREATE INDEX idx_scans_workflow_id ON scans(workflow_id);
CREATE INDEX idx_findings_scan_id ON findings(scan_id);
CREATE INDEX idx_findings_organization_id ON findings(organization_id);
CREATE INDEX idx_findings_status ON findings(status);
CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

---

### 3.4 Adaptações Necessárias no Código Atual

#### 3.4.1 Multi-Tenancy no Temporal

```typescript
// src/temporal/workflows.ts (MODIFICAR)
export async function pentestPipelineWorkflow(
  input: PipelineInput & { tenantId: string } // ADICIONAR tenantId
): Promise<PipelineState> {
  // Namespace Temporal já isolado por tenant
  // Mas adicionar tenantId em todos os logs e métricas
  const activityInput: ActivityInput = {
    ...input,
    tenantId: input.tenantId, // NOVO
  };

  // ... resto do código
}
```

#### 3.4.2 Worker Pool por Tenant

```typescript
// src/temporal/worker.ts (MODIFICAR)
import { Worker } from '@temporalio/worker';

// Cada worker roda em um namespace específico
const tenantId = process.env.TENANT_ID; // Passado via K8s env
const namespace = `tenant-${tenantId}`;

const worker = await Worker.create({
  namespace, // NOVO: namespace por tenant
  taskQueue: 'shannon-pipeline',
  workflowsPath: './workflows.js',
  activities,
});

await worker.run();
```

#### 3.4.3 API de Iniciação de Scans

```typescript
// backend/src/scans/scans.service.ts (NOVO)
import { Injectable } from '@nestjs/common';
import { Client } from '@temporalio/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScansService {
  constructor(
    private prisma: PrismaService,
    private temporalClient: Client
  ) {}

  async startScan(
    organizationId: string,
    userId: string,
    dto: StartScanDto
  ) {
    // 1. Criar registro no DB
    const scan = await this.prisma.scan.create({
      data: {
        organizationId,
        projectId: dto.projectId,
        status: 'queued',
        workflowId: `scan-${organizationId}-${Date.now()}`,
        createdBy: userId,
      },
    });

    // 2. Iniciar workflow no Temporal (namespace do tenant)
    const namespace = `tenant-${organizationId}`;
    const handle = await this.temporalClient.workflow.start(
      'pentestPipelineWorkflow',
      {
        taskQueue: 'shannon-pipeline',
        workflowId: scan.workflowId,
        args: [{
          tenantId: organizationId,
          webUrl: dto.webUrl,
          repoPath: dto.repoPath,
          configPath: dto.configPath,
        }],
      }
    );

    // 3. Atualizar status
    await this.prisma.scan.update({
      where: { id: scan.id },
      data: { status: 'running', startedAt: new Date() },
    });

    return scan;
  }

  async getScanProgress(scanId: string, organizationId: string) {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, organizationId },
    });

    if (!scan) throw new NotFoundException();

    // Query Temporal workflow
    const handle = this.temporalClient.workflow.getHandle(scan.workflowId);
    const progress = await handle.query('getProgress');

    return {
      ...scan,
      progress,
    };
  }
}
```

#### 3.4.4 WebSocket para Real-Time Updates

```typescript
// backend/src/scans/scans.gateway.ts (NOVO)
import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/scans' })
export class ScansGateway {
  @SubscribeMessage('subscribe:scan')
  async handleSubscribe(client: Socket, scanId: string) {
    // Verificar permissão do usuário
    const user = client.data.user;
    const scan = await this.scansService.getScan(scanId, user.organizationId);

    if (!scan) {
      client.emit('error', { message: 'Scan not found' });
      return;
    }

    // Join room
    client.join(`scan:${scanId}`);

    // Poll Temporal para updates (ou usar Temporal Cloud webhooks)
    const interval = setInterval(async () => {
      const progress = await this.scansService.getScanProgress(
        scanId,
        user.organizationId
      );

      client.to(`scan:${scanId}`).emit('scan:progress', progress);

      if (progress.status === 'completed' || progress.status === 'failed') {
        clearInterval(interval);
      }
    }, 5000);

    client.on('disconnect', () => clearInterval(interval));
  }
}
```

---

### 3.5 Infraestrutura Kubernetes

#### 3.5.1 Worker Pool (StatefulSet)

```yaml
# k8s/worker-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: shannon-worker
spec:
  serviceName: shannon-worker
  replicas: 3 # Auto-scale baseado em carga
  selector:
    matchLabels:
      app: shannon-worker
  template:
    metadata:
      labels:
        app: shannon-worker
    spec:
      containers:
      - name: worker
        image: shannon/worker:latest
        env:
        - name: TEMPORAL_ADDRESS
          value: temporal.temporal.svc.cluster.local:7233
        - name: TENANT_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.labels['tenant-id']
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: shannon-secrets
              key: anthropic-api-key
        resources:
          requests:
            memory: "4Gi"
            cpu: "2"
          limits:
            memory: "8Gi"
            cpu: "4"
        volumeMounts:
        - name: shm
          mountPath: /dev/shm
      volumes:
      - name: shm
        emptyDir:
          medium: Memory
          sizeLimit: 2Gi
```

#### 3.5.2 API Backend (Deployment)

```yaml
# k8s/backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shannon-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shannon-backend
  template:
    metadata:
      labels:
        app: shannon-backend
    spec:
      containers:
      - name: backend
        image: shannon/backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: shannon-secrets
              key: database-url
        - name: REDIS_URL
          value: redis://redis:6379
        - name: S3_BUCKET
          value: shannon-reports
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

---

## 4. Roadmap de Implementação

### Fase 1: MVP Foundation (8-10 semanas)

**Semanas 1-2: Setup & Auth**
- [ ] Setup monorepo (Turborepo ou Nx)
- [ ] Setup NestJS backend
- [ ] Setup Next.js frontend
- [ ] Implement authentication (Clerk ou Auth0)
- [ ] Database schema + Prisma setup
- [ ] Basic RBAC

**Semanas 3-4: Core API**
- [ ] Projects CRUD
- [ ] Scans API (start, list, get)
- [ ] Temporal integration (multi-tenant)
- [ ] Worker pool com tenant isolation
- [ ] S3 storage setup

**Semanas 5-6: Frontend Dashboard**
- [ ] Dashboard layout (shadcn/ui)
- [ ] Projects list/create
- [ ] Scans list/view
- [ ] Real-time progress (WebSocket)
- [ ] Basic report viewer

**Semanas 7-8: Findings & Reports**
- [ ] Findings API (list, filter, update)
- [ ] Findings UI (table, filters)
- [ ] Report viewer (interactive HTML)
- [ ] Report download (PDF generation)

**Semanas 9-10: Billing & Launch Prep**
- [ ] Stripe integration
- [ ] Usage metering
- [ ] Plans & subscriptions
- [ ] Landing page
- [ ] Documentation

---

### Fase 2: Growth Features (8-12 semanas)

**Funcionalidades:**
- [ ] Scheduled scans
- [ ] Scan comparison (diff)
- [ ] Jira/Linear integration
- [ ] Slack notifications
- [ ] API keys & webhooks
- [ ] Advanced analytics dashboard
- [ ] CI/CD integration (GitHub Actions)
- [ ] Public API documentation
- [ ] Knowledge base

---

### Fase 3: Enterprise & Scale (Contínuo)

**Funcionalidades:**
- [ ] SSO (SAML, OIDC)
- [ ] Advanced RBAC (custom roles)
- [ ] Compliance reports (SOC2, ISO27001)
- [ ] White-labeling
- [ ] On-premise deployment option
- [ ] SLA monitoring
- [ ] Advanced auto-scaling
- [ ] Multi-region support

---

## 5. Custos Operacionais Estimados

### Infrastructure (AWS)

| Recurso | Especificação | Custo/Mês |
|---------|---------------|-----------|
| **EKS Cluster** | 3 nodes (m5.xlarge) | $500 |
| **RDS PostgreSQL** | db.t3.large | $150 |
| **ElastiCache Redis** | cache.t3.medium | $80 |
| **S3 Storage** | 500GB | $12 |
| **S3 Transfer** | 1TB out | $90 |
| **Load Balancer** | ALB | $25 |
| **CloudWatch** | Logs + metrics | $50 |
| **Temporal Cloud** | Managed (opcional) | $200-$1000 |
| **Total Base** | | **~$1,107 - $1,907/mês** |

### Per-User Scaling
- **Workers**: +$100-200/mês por 100 usuários ativos
- **LLM Costs**: Pass-through para usuários (ou margin de 20-30%)
- **Storage**: ~$0.023/GB/mês (cresce linearmente)

---

## 6. Considerações de Segurança

### Crítico para Pentest SaaS:

1. **Isolation is Everything**:
   - Temporal namespaces por tenant
   - Network policies no K8s
   - Separate Chromium instances

2. **Secrets Management**:
   - Vault para API keys
   - Encrypt configs at rest
   - Rotate credentials automaticamente

3. **Compliance**:
   - SOC2 Type II (obrigatório para Enterprise)
   - GDPR compliance (data residency)
   - Penetration testing do próprio produto (ironia!)

4. **Rate Limiting**:
   - Por tenant (evitar abuso)
   - Por API key
   - Por IP (DDoS protection)

5. **Audit Everything**:
   - Logs imutáveis
   - Retention de 1 ano+
   - Export para clientes (compliance)

---

## 7. Métricas de Sucesso

### Produto (MVP - Mês 6)
- 50+ organizações ativas
- 500+ scans executados
- 85%+ scan success rate
- < 5% churn mensal

### Técnicas
- 99.5% uptime (SLA)
- < 2s latência API (P95)
- < 100ms DB queries (P95)
- < 10min scan queue wait

### Negócio (Ano 1)
- $50k ARR (Annual Recurring Revenue)
- $100 CAC (Customer Acquisition Cost)
- 3:1 LTV:CAC ratio
- 20%+ MoM growth

---

## 8. Conclusão & Recomendações

### Deve Fazer:
✅ **Manter Temporal** - Já é robusto, só precisa de multi-tenancy
✅ **Reusar toda lógica de pentest** - O core está excelente
✅ **Investir pesado em Frontend** - É onde usuários vivem
✅ **Stripe desde o Dia 1** - Billing é complexo, não subestime
✅ **Observability desde o início** - Sem isso, impossível debugar produção

### Não Fazer (ainda):
❌ Reescrever workflows - Não vale a pena
❌ Suportar múltiplas clouds - Foco em 1 (AWS ou GCP)
❌ Mobile app - Web responsivo é suficiente
❌ On-premise - Só quando necessário (Enterprise)

### Próximos Passos:
1. Validar demanda (landing page + waitlist)
2. Prototipar dashboard (Figma)
3. Começar backend API (NestJS + Prisma)
4. Adaptar workers para multi-tenancy
5. Beta privado com 10-20 early adopters

**Estimativa Final:** 6-9 meses para MVP robusto, mais 12-18 meses para product-market fit.

---

## 9. Apêndices

### A. Tecnologias Complementares a Avaliar
- **Authn/Authz**: Clerk, Auth0, Supabase Auth
- **Payments**: Stripe (primary), Paddle (backup)
- **Email**: Resend, SendGrid
- **Analytics**: PostHog, Mixpanel
- **Support**: Intercom, Plain
- **Docs**: Mintlify, GitBook

### B. Referências
- Temporal Multi-Tenancy: https://docs.temporal.io/kb/multi-tenancy
- Kubernetes Security: https://kubernetes.io/docs/concepts/security/
- OWASP SaaS Top 10: https://owasp.org/www-project-saas-top-ten/

---

**Documento vivo - atualizar conforme evolução do projeto**
