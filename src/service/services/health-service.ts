/**
 * Health Service - Dependency health checks for Shannon Service
 * Provides health status for Kubernetes probes and monitoring
 */

import { checkDatabaseHealth } from '../db.js';
import { checkTemporalHealth } from '../temporal-client.js';

export type DependencyStatus = 'healthy' | 'unhealthy' | 'degraded';

export interface DependencyHealth {
  status: DependencyStatus;
  latencyMs?: number;
  message?: string;
}

export interface HealthCheckResult {
  status: DependencyStatus;
  version: string;
  uptime: number;
  timestamp: Date;
  dependencies: {
    database: DependencyHealth;
    temporal: DependencyHealth;
  };
}

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: boolean;
    temporal: boolean;
  };
}

export interface LivenessResult {
  alive: boolean;
  uptime: number;
}

// Service start time for uptime calculation
const serviceStartTime = Date.now();

// Service version from package.json or environment
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';

/**
 * HealthService - Manages health checks for all dependencies
 */
export class HealthService {
  private lastDatabaseCheck: DependencyHealth | null = null;
  private lastTemporalCheck: DependencyHealth | null = null;
  private lastCheckTime: number = 0;
  private readonly cacheDurationMs: number;

  constructor(cacheDurationMs: number = 5000) {
    this.cacheDurationMs = cacheDurationMs;
  }

  /**
   * Get overall service health status
   * Aggregates all dependency checks
   */
  async getHealth(): Promise<HealthCheckResult> {
    const [databaseHealth, temporalHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkTemporal(),
    ]);

    // Determine overall status
    const status = this.determineOverallStatus(databaseHealth, temporalHealth);

    return {
      status,
      version: SERVICE_VERSION,
      uptime: this.getUptimeSeconds(),
      timestamp: new Date(),
      dependencies: {
        database: databaseHealth,
        temporal: temporalHealth,
      },
    };
  }

  /**
   * Check if service is ready to accept traffic
   * Used by Kubernetes readiness probe
   */
  async checkReadiness(): Promise<ReadinessResult> {
    const [databaseOk, temporalOk] = await Promise.all([
      this.isDatabaseHealthy(),
      this.isTemporalHealthy(),
    ]);

    return {
      ready: databaseOk && temporalOk,
      checks: {
        database: databaseOk,
        temporal: temporalOk,
      },
    };
  }

  /**
   * Check if service is alive
   * Used by Kubernetes liveness probe
   */
  checkLiveness(): LivenessResult {
    return {
      alive: true,
      uptime: this.getUptimeSeconds(),
    };
  }

  /**
   * Check database connectivity with latency measurement
   */
  async checkDatabase(): Promise<DependencyHealth> {
    // Return cached result if still valid
    if (this.isCacheValid() && this.lastDatabaseCheck) {
      return this.lastDatabaseCheck;
    }

    const startTime = Date.now();
    try {
      const isHealthy = await checkDatabaseHealth();
      const latencyMs = Date.now() - startTime;

      this.lastDatabaseCheck = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latencyMs,
        message: isHealthy ? 'Database connection successful' : 'Database connection failed',
      };
    } catch (error) {
      this.lastDatabaseCheck = {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown database error',
      };
    }

    this.lastCheckTime = Date.now();
    return this.lastDatabaseCheck;
  }

  /**
   * Check Temporal server connectivity with latency measurement
   */
  async checkTemporal(): Promise<DependencyHealth> {
    // Return cached result if still valid
    if (this.isCacheValid() && this.lastTemporalCheck) {
      return this.lastTemporalCheck;
    }

    const startTime = Date.now();
    try {
      const isHealthy = await checkTemporalHealth();
      const latencyMs = Date.now() - startTime;

      this.lastTemporalCheck = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latencyMs,
        message: isHealthy ? 'Temporal connection successful' : 'Temporal connection failed',
      };
    } catch (error) {
      this.lastTemporalCheck = {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown Temporal error',
      };
    }

    this.lastCheckTime = Date.now();
    return this.lastTemporalCheck;
  }

  /**
   * Quick check if database is healthy (for readiness)
   */
  async isDatabaseHealthy(): Promise<boolean> {
    const health = await this.checkDatabase();
    return health.status === 'healthy';
  }

  /**
   * Quick check if Temporal is healthy (for readiness)
   */
  async isTemporalHealthy(): Promise<boolean> {
    const health = await this.checkTemporal();
    return health.status === 'healthy';
  }

  /**
   * Get service uptime in seconds
   */
  getUptimeSeconds(): number {
    return Math.floor((Date.now() - serviceStartTime) / 1000);
  }

  /**
   * Get service version
   */
  getVersion(): string {
    return SERVICE_VERSION;
  }

  /**
   * Determine overall health status from dependency checks
   */
  private determineOverallStatus(
    database: DependencyHealth,
    temporal: DependencyHealth
  ): DependencyStatus {
    // If any critical dependency is unhealthy, service is unhealthy
    if (database.status === 'unhealthy') {
      return 'unhealthy';
    }

    // Temporal being unavailable degrades the service (scans can be queued)
    if (temporal.status === 'unhealthy') {
      return 'degraded';
    }

    // If any dependency is degraded, service is degraded
    if (database.status === 'degraded' || temporal.status === 'degraded') {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Check if cached results are still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.lastCheckTime < this.cacheDurationMs;
  }

  /**
   * Clear cached health check results
   */
  clearCache(): void {
    this.lastDatabaseCheck = null;
    this.lastTemporalCheck = null;
    this.lastCheckTime = 0;
  }
}

// Singleton instance
let healthServiceInstance: HealthService | null = null;

/**
 * Get the HealthService singleton
 */
export function getHealthService(): HealthService {
  if (!healthServiceInstance) {
    healthServiceInstance = new HealthService();
  }
  return healthServiceInstance;
}

export default HealthService;
