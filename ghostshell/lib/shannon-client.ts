/**
 * Shannon Service API Client
 *
 * Type-safe client for communicating with the Shannon Service API.
 * Used by the web application to trigger scans, monitor progress, and retrieve results.
 */

// ============================================
// Types (aligned with service API types)
// ============================================

export type ScanStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ReportFormat = "PDF" | "HTML" | "JSON" | "SARIF";

export type ReportJobStatus = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";

export type AuthMethod = "form" | "api_token" | "basic" | "sso";

export interface ScanJob {
  id: string;
  organizationId: string;
  projectId: string;
  targetUrl: string;
  status: ScanStatus;
  workflowId: string | null;
  parentScanId: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStatus {
  agentId: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
}

export interface ScanProgress {
  scanId: string;
  status: ScanStatus;
  phase: string;
  percentage: number;
  agentStatuses: AgentStatus[];
  startedAt: string | null;
  eta: string | null;
  currentActivity: string | null;
}

export interface ScanFinding {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  status: string;
  cvss: number | null;
  cwe: string | null;
  remediation: string | null;
}

export interface ScanResults {
  scanId: string;
  status: ScanStatus;
  findings: ScanFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  reportPaths: {
    html: string | null;
    pdf: string | null;
    json: string | null;
  } | null;
  nextCursor: string | null;
}

export interface ReportJob {
  id: string;
  scanId: string;
  organizationId: string;
  format: ReportFormat;
  template: string | null;
  status: ReportJobStatus;
  progress: number;
  outputPath: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ValidationResult {
  valid: boolean;
  validatedAt: string;
  error?: string;
  errorCode?: string;
}

export interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  version: string;
  uptime: number;
  timestamp: string;
  dependencies: {
    database: "healthy" | "unhealthy";
    temporal: "healthy" | "unhealthy";
  };
}

export interface ServiceInfo {
  name: string;
  version: string;
  buildTime?: string;
  apiVersions: string[];
}

export interface AuthMethodConfig {
  method: AuthMethod;
  displayName: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
}

export interface ScanOptionConfig {
  name: string;
  type: "boolean" | "number" | "string" | "array";
  description: string;
  default: unknown;
  min?: number;
  max?: number;
  options?: string[];
}

export interface PhaseConfig {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  order: number;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  requestId: string;
  timestamp: string;
  errors?: Array<{
    code: string;
    field?: string;
    message: string;
  }>;
}

// ============================================
// Request Types
// ============================================

export interface CreateScanRequest {
  targetUrl: string;
  projectId: string;
  config?: {
    authMethod?: AuthMethod;
    phases?: string[];
    options?: Record<string, unknown>;
  };
}

export interface CreateReportRequest {
  format: ReportFormat;
  template?: string;
}

export interface ValidationRequest {
  targetUrl: string;
  authMethod: AuthMethod;
  credentials: Record<string, string>;
  totpSecret?: string;
}

export interface ListScansOptions {
  status?: ScanStatus;
  limit?: number;
  cursor?: string;
}

export interface GetResultsOptions {
  limit?: number;
  cursor?: string;
}

// ============================================
// Response Types
// ============================================

export interface ScanListResponse {
  scans: ScanJob[];
  nextCursor: string | null;
  total: number;
}

// ============================================
// Error Classes
// ============================================

export class ShannonApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly problemDetail?: ProblemDetail
  ) {
    super(message);
    this.name = "ShannonApiError";
  }
}

export class ShannonConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "ShannonConnectionError";
  }
}

// ============================================
// Client Configuration
// ============================================

export interface ShannonClientConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

// ============================================
// Shannon API Client
// ============================================

export class ShannonClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: ShannonClientConfig = {}) {
    this.baseUrl =
      config.baseUrl ||
      process.env.SHANNON_SERVICE_URL ||
      "http://localhost:3001";
    this.apiKey = config.apiKey || process.env.SHANNON_API_KEY || "";
    this.timeout = config.timeout || 30000;

    if (!this.apiKey) {
      console.warn(
        "ShannonClient: No API key provided. Authenticated requests will fail."
      );
    }
  }

  // ============================================
  // HTTP Helpers
  // ============================================

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      params?: Record<string, string | number | undefined>;
      requireAuth?: boolean;
    } = {}
  ): Promise<T> {
    const { body, params, requireAuth = true } = options;

    // Build URL with query params
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (requireAuth && this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    // Make request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response
      const contentType = response.headers.get("content-type");
      const isJson = contentType?.includes("application/json");

      if (!response.ok) {
        const errorData = isJson ? await response.json() : null;
        throw new ShannonApiError(
          errorData?.detail || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData as ProblemDetail | undefined
        );
      }

      if (isJson) {
        return (await response.json()) as T;
      }

      return {} as T;
    } catch (error) {
      if (error instanceof ShannonApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new ShannonConnectionError(`Request timed out after ${this.timeout}ms`);
      }

      throw new ShannonConnectionError(
        `Failed to connect to Shannon service: ${error instanceof Error ? error.message : "Unknown error"}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ============================================
  // Health Endpoints (Public - No Auth Required)
  // ============================================

  async getHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>("GET", "/health", { requireAuth: false });
  }

  async getReadiness(): Promise<{ ready: boolean }> {
    return this.request<{ ready: boolean }>("GET", "/health/ready", {
      requireAuth: false,
    });
  }

  async getLiveness(): Promise<{ alive: boolean }> {
    return this.request<{ alive: boolean }>("GET", "/health/live", {
      requireAuth: false,
    });
  }

  async getMetrics(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/metrics`);
    return response.text();
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    return this.request<ServiceInfo>("GET", "/api/v1/info", {
      requireAuth: false,
    });
  }

  // ============================================
  // Scan Endpoints
  // ============================================

  async createScan(request: CreateScanRequest): Promise<ScanJob> {
    return this.request<ScanJob>("POST", "/api/v1/scans", { body: request });
  }

  async listScans(options: ListScansOptions = {}): Promise<ScanListResponse> {
    return this.request<ScanListResponse>("GET", "/api/v1/scans", {
      params: {
        status: options.status,
        limit: options.limit,
        cursor: options.cursor,
      },
    });
  }

  async getScan(scanId: string): Promise<ScanJob> {
    return this.request<ScanJob>("GET", `/api/v1/scans/${scanId}`);
  }

  async getScanProgress(scanId: string): Promise<ScanProgress> {
    return this.request<ScanProgress>("GET", `/api/v1/scans/${scanId}/progress`);
  }

  async getScanResults(
    scanId: string,
    options: GetResultsOptions = {}
  ): Promise<ScanResults> {
    return this.request<ScanResults>("GET", `/api/v1/scans/${scanId}/results`, {
      params: {
        limit: options.limit,
        cursor: options.cursor,
      },
    });
  }

  async cancelScan(scanId: string): Promise<ScanJob> {
    return this.request<ScanJob>("DELETE", `/api/v1/scans/${scanId}`);
  }

  async retryScan(scanId: string): Promise<ScanJob> {
    return this.request<ScanJob>("POST", `/api/v1/scans/${scanId}/retry`);
  }

  // ============================================
  // Report Endpoints
  // ============================================

  async createReport(
    scanId: string,
    request: CreateReportRequest
  ): Promise<ReportJob> {
    return this.request<ReportJob>("POST", `/api/v1/scans/${scanId}/reports`, {
      body: request,
    });
  }

  async getReportStatus(jobId: string): Promise<ReportJob> {
    return this.request<ReportJob>("GET", `/api/v1/reports/${jobId}/status`);
  }

  async downloadReport(jobId: string): Promise<Blob> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/reports/${jobId}/download`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new ShannonApiError(
        errorData?.detail || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorData as ProblemDetail | undefined
      );
    }

    return response.blob();
  }

  // ============================================
  // Auth Validation Endpoints
  // ============================================

  async validateAuth(request: ValidationRequest): Promise<ValidationResult> {
    return this.request<ValidationResult>("POST", "/api/v1/auth/validate", {
      body: request,
    });
  }

  // ============================================
  // Configuration Discovery Endpoints
  // ============================================

  async getAuthMethods(): Promise<{ methods: AuthMethodConfig[] }> {
    return this.request<{ methods: AuthMethodConfig[] }>(
      "GET",
      "/api/v1/config/auth-methods"
    );
  }

  async getScanOptions(): Promise<{ options: ScanOptionConfig[] }> {
    return this.request<{ options: ScanOptionConfig[] }>(
      "GET",
      "/api/v1/config/scan-options"
    );
  }

  async getPhases(): Promise<{ phases: PhaseConfig[] }> {
    return this.request<{ phases: PhaseConfig[] }>("GET", "/api/v1/config/phases");
  }
}

// ============================================
// Singleton Instance
// ============================================

let defaultClient: ShannonClient | null = null;

export function getShannonClient(): ShannonClient {
  if (!defaultClient) {
    defaultClient = new ShannonClient();
  }
  return defaultClient;
}

// ============================================
// Convenience Functions (use default client)
// ============================================

export async function startScan(
  targetUrl: string,
  projectId: string,
  config?: CreateScanRequest["config"]
): Promise<ScanJob> {
  return getShannonClient().createScan({ targetUrl, projectId, config });
}

export async function getScanProgress(scanId: string): Promise<ScanProgress> {
  return getShannonClient().getScanProgress(scanId);
}

export async function getScanResults(scanId: string): Promise<ScanResults> {
  return getShannonClient().getScanResults(scanId);
}

export async function cancelScan(scanId: string): Promise<ScanJob> {
  return getShannonClient().cancelScan(scanId);
}

export async function checkHealth(): Promise<HealthStatus> {
  return getShannonClient().getHealth();
}
