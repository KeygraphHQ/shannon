/**
 * API Types for Shannon Service
 * Based on data-model.md and OpenAPI specification
 */

import { z } from 'zod';

// ============================================
// Enums and Constants
// ============================================

export const ScanStatusEnum = z.enum([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type ScanStatus = z.infer<typeof ScanStatusEnum>;

export const ReportFormatEnum = z.enum(['PDF', 'HTML', 'JSON', 'SARIF']);
export type ReportFormat = z.infer<typeof ReportFormatEnum>;

export const ReportJobStatusEnum = z.enum([
  'PENDING',
  'GENERATING',
  'COMPLETED',
  'FAILED',
]);
export type ReportJobStatus = z.infer<typeof ReportJobStatusEnum>;

export const AuthMethodEnum = z.enum(['form', 'api_token', 'basic', 'sso']);
export type AuthMethod = z.infer<typeof AuthMethodEnum>;

export const AgentStatusEnum = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type AgentStatusType = z.infer<typeof AgentStatusEnum>;

// ============================================
// API Key Scopes
// ============================================

export const API_KEY_SCOPES = [
  'scan:read',
  'scan:write',
  'auth:validate',
  'config:read',
  'admin:*',
] as const;

export type APIKeyScope = (typeof API_KEY_SCOPES)[number];

export const APIKeyScopeSchema = z.enum(API_KEY_SCOPES);

// ============================================
// Request/Response Schemas
// ============================================

// Pagination
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      cursor: z.string().nullable(),
      hasMore: z.boolean(),
      total: z.number().optional(),
    }),
  });

// Container isolation config (Epic 006)
export const ContainerIsolationConfigSchema = z.object({
  /** Enable container isolation for this scan */
  enabled: z.boolean().default(false),
  /** Subscription plan for resource limits (free, pro, enterprise) */
  planId: z.enum(['free', 'pro', 'enterprise']).optional(),
  /** Override default scanner image */
  image: z.string().optional(),
  /** Pin to specific image digest */
  imageDigest: z.string().optional(),
});
export type ContainerIsolationConfig = z.infer<typeof ContainerIsolationConfigSchema>;

// Scan Request
export const CreateScanRequestSchema = z.object({
  targetUrl: z.string().url(),
  projectId: z.string().cuid(),
  config: z
    .object({
      authMethod: AuthMethodEnum.optional(),
      phases: z.array(z.string()).optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  /** Container isolation configuration (Epic 006) */
  containerIsolation: ContainerIsolationConfigSchema.optional(),
});
export type CreateScanRequest = z.infer<typeof CreateScanRequestSchema>;

// Scan Response
export const ScanJobSchema = z.object({
  id: z.string().cuid(),
  organizationId: z.string().cuid(),
  projectId: z.string().cuid(),
  targetUrl: z.string().url(),
  status: ScanStatusEnum,
  workflowId: z.string().nullable(),
  parentScanId: z.string().cuid().nullable(),
  queuedAt: z.coerce.date().nullable(),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ScanJob = z.infer<typeof ScanJobSchema>;

// Agent Status
export const AgentStatusSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  status: AgentStatusEnum,
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
});
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// Scan Progress
export const ScanProgressSchema = z.object({
  scanId: z.string().cuid(),
  status: ScanStatusEnum,
  phase: z.string(),
  percentage: z.number().min(0).max(100),
  agentStatuses: z.array(AgentStatusSchema),
  startedAt: z.coerce.date().nullable(),
  eta: z.coerce.date().nullable(),
  currentActivity: z.string().nullable(),
});
export type ScanProgress = z.infer<typeof ScanProgressSchema>;

// Scan Results
export const ScanFindingSchema = z.object({
  id: z.string().cuid(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  category: z.string(),
  status: z.string(),
  cvss: z.number().nullable(),
  cwe: z.string().nullable(),
  remediation: z.string().nullable(),
});
export type ScanFinding = z.infer<typeof ScanFindingSchema>;

export const ScanResultsSchema = z.object({
  scanId: z.string().cuid(),
  status: ScanStatusEnum,
  findings: z.array(ScanFindingSchema),
  summary: z.object({
    total: z.number(),
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    info: z.number(),
  }),
  reportPaths: z
    .object({
      html: z.string().nullable(),
      pdf: z.string().nullable(),
      json: z.string().nullable(),
    })
    .nullable(),
});
export type ScanResults = z.infer<typeof ScanResultsSchema>;

// ============================================
// Validation Request/Response
// ============================================

export const FormCredentialsSchema = z.object({
  loginUrl: z.string().url(),
  usernameField: z.string(),
  passwordField: z.string(),
  username: z.string(),
  password: z.string(),
  submitSelector: z.string().optional(),
});

export const ApiTokenCredentialsSchema = z.object({
  headerName: z.string().default('Authorization'),
  token: z.string(),
});

export const BasicAuthCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const SsoCredentialsSchema = z.object({
  provider: z.string(),
  idpUrl: z.string().url(),
  credentials: z.record(z.string(), z.string()),
});

export const ValidationRequestSchema = z.object({
  targetUrl: z.string().url(),
  authMethod: AuthMethodEnum,
  credentials: z.union([
    FormCredentialsSchema,
    ApiTokenCredentialsSchema,
    BasicAuthCredentialsSchema,
    SsoCredentialsSchema,
  ]),
  totpSecret: z.string().optional(),
});
export type ValidationRequest = z.infer<typeof ValidationRequestSchema>;

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  validatedAt: z.coerce.date(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// Validation Error Codes
export const VALIDATION_ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: 'Username/password incorrect',
  AUTH_TARGET_UNREACHABLE: 'Cannot connect to target',
  AUTH_TOTP_INVALID: 'TOTP code rejected',
  AUTH_SSO_FAILED: 'SSO flow failed',
  AUTH_TIMEOUT: 'Validation timed out',
} as const;

export type ValidationErrorCode = keyof typeof VALIDATION_ERROR_CODES;

// ============================================
// Report Job
// ============================================

export const CreateReportRequestSchema = z.object({
  format: ReportFormatEnum,
  template: z.string().optional(),
});
export type CreateReportRequest = z.infer<typeof CreateReportRequestSchema>;

export const ReportJobSchema = z.object({
  id: z.string().cuid(),
  scanId: z.string().cuid(),
  organizationId: z.string().cuid(),
  format: ReportFormatEnum,
  template: z.string().nullable(),
  status: ReportJobStatusEnum,
  progress: z.number().min(0).max(100),
  outputPath: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});
export type ReportJob = z.infer<typeof ReportJobSchema>;

// ============================================
// Health Check
// ============================================

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.coerce.date(),
  dependencies: z.object({
    database: z.enum(['healthy', 'unhealthy']),
    temporal: z.enum(['healthy', 'unhealthy']),
  }),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

// ============================================
// Configuration Discovery
// ============================================

export const AuthMethodConfigSchema = z.object({
  method: AuthMethodEnum,
  displayName: z.string(),
  description: z.string(),
  requiredFields: z.array(z.string()),
  optionalFields: z.array(z.string()),
});
export type AuthMethodConfig = z.infer<typeof AuthMethodConfigSchema>;

export const ScanOptionConfigSchema = z.object({
  name: z.string(),
  type: z.enum(['boolean', 'number', 'string', 'array']),
  description: z.string(),
  default: z.unknown(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.string()).optional(),
});
export type ScanOptionConfig = z.infer<typeof ScanOptionConfigSchema>;

export const PhaseConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  defaultEnabled: z.boolean(),
  order: z.number(),
});
export type PhaseConfig = z.infer<typeof PhaseConfigSchema>;

// ============================================
// RFC 7807 Problem Details
// ============================================

export const ProblemDetailSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  instance: z.string().optional(),
  requestId: z.string(),
  timestamp: z.coerce.date(),
  errors: z
    .array(
      z.object({
        code: z.string(),
        field: z.string().optional(),
        message: z.string(),
      })
    )
    .optional(),
});
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

// Error types for RFC 7807
export const ERROR_TYPES = {
  AUTH_MISSING_KEY: 'https://shannon.dev/errors/auth/missing-key',
  AUTH_INVALID_KEY: 'https://shannon.dev/errors/auth/invalid-key',
  AUTH_EXPIRED_KEY: 'https://shannon.dev/errors/auth/expired-key',
  AUTH_INSUFFICIENT_SCOPE: 'https://shannon.dev/errors/auth/insufficient-scope',
  AUTH_ORG_MISMATCH: 'https://shannon.dev/errors/auth/org-mismatch',
  SCAN_LIMIT_EXCEEDED: 'https://shannon.dev/errors/scan/limit-exceeded',
  RATE_LIMIT_EXCEEDED: 'https://shannon.dev/errors/rate-limit-exceeded',
  VALIDATION_FAILED: 'https://shannon.dev/errors/validation-failed',
  SCAN_NOT_FOUND: 'https://shannon.dev/errors/scan/not-found',
  TEMPORAL_UNAVAILABLE: 'https://shannon.dev/errors/temporal-unavailable',
  INTERNAL_ERROR: 'https://shannon.dev/errors/internal-error',
} as const;

export type ErrorType = keyof typeof ERROR_TYPES;

// ============================================
// API Version Info
// ============================================

export const ServiceInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  buildTime: z.string().optional(),
  apiVersions: z.array(z.string()),
});
export type ServiceInfo = z.infer<typeof ServiceInfoSchema>;
