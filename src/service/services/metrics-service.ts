/**
 * Metrics Service - Prometheus-format metrics collector for Shannon Service
 * Tracks scan counts, durations, error rates, and system metrics
 */

import { getHealthService } from './health-service.js';

// Metric types
interface Counter {
  name: string;
  help: string;
  type: 'counter';
  labels?: string[];
  value: number;
  labelValues?: Map<string, number>;
}

interface Gauge {
  name: string;
  help: string;
  type: 'gauge';
  labels?: string[];
  value: number;
  labelValues?: Map<string, number>;
}

interface Histogram {
  name: string;
  help: string;
  type: 'histogram';
  labels?: string[];
  buckets: number[];
  values: number[];
  sum: number;
  count: number;
  labelHistograms?: Map<string, { values: number[]; sum: number; count: number }>;
}

type Metric = Counter | Gauge | Histogram;

// Default histogram buckets for latency (in ms)
const DEFAULT_LATENCY_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

// Default histogram buckets for scan duration (in seconds)
const SCAN_DURATION_BUCKETS = [60, 300, 600, 1800, 3600, 7200, 14400, 28800];

/**
 * MetricsService - Collects and exports Prometheus-format metrics
 */
export class MetricsService {
  private metrics: Map<string, Metric> = new Map();

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Initialize default metrics
   */
  private initializeMetrics(): void {
    // HTTP request metrics
    this.registerCounter('shannon_http_requests_total', 'Total HTTP requests', ['method', 'path', 'status']);
    this.registerHistogram('shannon_http_request_duration_ms', 'HTTP request duration in milliseconds', DEFAULT_LATENCY_BUCKETS, ['method', 'path']);

    // Scan metrics
    this.registerCounter('shannon_scans_total', 'Total scans created', ['status']);
    this.registerGauge('shannon_scans_active', 'Currently active scans');
    this.registerHistogram('shannon_scan_duration_seconds', 'Scan duration in seconds', SCAN_DURATION_BUCKETS, ['status']);

    // Agent metrics
    this.registerCounter('shannon_agents_total', 'Total agent executions', ['agent', 'status']);
    this.registerHistogram('shannon_agent_duration_seconds', 'Agent execution duration in seconds', SCAN_DURATION_BUCKETS, ['agent']);

    // Finding metrics
    this.registerCounter('shannon_findings_total', 'Total findings discovered', ['severity']);

    // Error metrics
    this.registerCounter('shannon_errors_total', 'Total errors', ['type']);

    // Dependency health metrics
    this.registerGauge('shannon_dependency_up', 'Dependency health status (1=up, 0=down)', ['dependency']);
    this.registerHistogram('shannon_dependency_latency_ms', 'Dependency health check latency', DEFAULT_LATENCY_BUCKETS, ['dependency']);
  }

  /**
   * Register a counter metric
   */
  registerCounter(name: string, help: string, labels?: string[]): void {
    const metric: Counter = {
      name,
      help,
      type: 'counter',
      value: 0,
    };
    if (labels) {
      metric.labels = labels;
      metric.labelValues = new Map();
    }
    this.metrics.set(name, metric);
  }

  /**
   * Register a gauge metric
   */
  registerGauge(name: string, help: string, labels?: string[]): void {
    const metric: Gauge = {
      name,
      help,
      type: 'gauge',
      value: 0,
    };
    if (labels) {
      metric.labels = labels;
      metric.labelValues = new Map();
    }
    this.metrics.set(name, metric);
  }

  /**
   * Register a histogram metric
   */
  registerHistogram(name: string, help: string, buckets: number[], labels?: string[]): void {
    const metric: Histogram = {
      name,
      help,
      type: 'histogram',
      buckets,
      values: new Array(buckets.length).fill(0) as number[],
      sum: 0,
      count: 0,
    };
    if (labels) {
      metric.labels = labels;
      metric.labelHistograms = new Map();
    }
    this.metrics.set(name, metric);
  }

  /**
   * Increment a counter
   */
  incCounter(name: string, labelValues?: Record<string, string>, value: number = 1): void {
    const metric = this.metrics.get(name) as Counter | undefined;
    if (!metric || metric.type !== 'counter') return;

    if (labelValues && metric.labelValues) {
      const key = this.labelKey(labelValues);
      metric.labelValues.set(key, (metric.labelValues.get(key) || 0) + value);
    } else {
      metric.value += value;
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labelValues?: Record<string, string>): void {
    const metric = this.metrics.get(name) as Gauge | undefined;
    if (!metric || metric.type !== 'gauge') return;

    if (labelValues && metric.labelValues) {
      const key = this.labelKey(labelValues);
      metric.labelValues.set(key, value);
    } else {
      metric.value = value;
    }
  }

  /**
   * Increment a gauge
   */
  incGauge(name: string, value: number = 1, labelValues?: Record<string, string>): void {
    const metric = this.metrics.get(name) as Gauge | undefined;
    if (!metric || metric.type !== 'gauge') return;

    if (labelValues && metric.labelValues) {
      const key = this.labelKey(labelValues);
      metric.labelValues.set(key, (metric.labelValues.get(key) || 0) + value);
    } else {
      metric.value += value;
    }
  }

  /**
   * Decrement a gauge
   */
  decGauge(name: string, value: number = 1, labelValues?: Record<string, string>): void {
    this.incGauge(name, -value, labelValues);
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, value: number, labelValues?: Record<string, string>): void {
    const metric = this.metrics.get(name) as Histogram | undefined;
    if (!metric || metric.type !== 'histogram') return;

    if (labelValues && metric.labelHistograms) {
      const key = this.labelKey(labelValues);
      let hist = metric.labelHistograms.get(key);
      if (!hist) {
        hist = { values: new Array(metric.buckets.length).fill(0), sum: 0, count: 0 };
        metric.labelHistograms.set(key, hist);
      }
      this.addToHistogram(hist, metric.buckets, value);
    } else {
      this.addToHistogram(metric, metric.buckets, value);
    }
  }

  /**
   * Add a value to histogram buckets
   */
  private addToHistogram(
    hist: { values: number[]; sum: number; count: number },
    buckets: number[],
    value: number
  ): void {
    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      if (bucket !== undefined && value <= bucket) {
        hist.values[i] = (hist.values[i] ?? 0) + 1;
      }
    }
    hist.sum += value;
    hist.count++;
  }

  /**
   * Create a label key from label values
   */
  private labelKey(labelValues: Record<string, string>): string {
    return Object.entries(labelValues)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  /**
   * Track an HTTP request
   */
  trackRequest(method: string, path: string, status: number, durationMs: number): void {
    // Normalize path (remove IDs)
    const normalizedPath = path.replace(/\/[a-z0-9]{25}/gi, '/:id');

    this.incCounter('shannon_http_requests_total', { method, path: normalizedPath, status: String(status) });
    this.observeHistogram('shannon_http_request_duration_ms', durationMs, { method, path: normalizedPath });
  }

  /**
   * Track a scan creation
   */
  trackScanCreated(status: string): void {
    this.incCounter('shannon_scans_total', { status });
  }

  /**
   * Track active scans
   */
  setActiveScans(count: number): void {
    this.setGauge('shannon_scans_active', count);
  }

  /**
   * Track scan completion
   */
  trackScanCompleted(status: string, durationSeconds: number): void {
    this.observeHistogram('shannon_scan_duration_seconds', durationSeconds, { status });
  }

  /**
   * Track agent execution
   */
  trackAgentExecution(agent: string, status: string, durationSeconds: number): void {
    this.incCounter('shannon_agents_total', { agent, status });
    this.observeHistogram('shannon_agent_duration_seconds', durationSeconds, { agent });
  }

  /**
   * Track a finding
   */
  trackFinding(severity: string): void {
    this.incCounter('shannon_findings_total', { severity });
  }

  /**
   * Track an error
   */
  trackError(type: string): void {
    this.incCounter('shannon_errors_total', { type });
  }

  /**
   * Update dependency health metrics
   */
  async updateDependencyMetrics(): Promise<void> {
    const healthService = getHealthService();

    const [dbHealth, temporalHealth] = await Promise.all([
      healthService.checkDatabase(),
      healthService.checkTemporal(),
    ]);

    this.setGauge('shannon_dependency_up', dbHealth.status === 'healthy' ? 1 : 0, { dependency: 'database' });
    this.setGauge('shannon_dependency_up', temporalHealth.status === 'healthy' ? 1 : 0, { dependency: 'temporal' });

    if (dbHealth.latencyMs !== undefined) {
      this.observeHistogram('shannon_dependency_latency_ms', dbHealth.latencyMs, { dependency: 'database' });
    }
    if (temporalHealth.latencyMs !== undefined) {
      this.observeHistogram('shannon_dependency_latency_ms', temporalHealth.latencyMs, { dependency: 'temporal' });
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  async exportPrometheus(): Promise<string> {
    // Update dependency metrics before export
    await this.updateDependencyMetrics();

    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      switch (metric.type) {
        case 'counter':
        case 'gauge':
          this.exportCounterOrGauge(lines, metric);
          break;
        case 'histogram':
          this.exportHistogram(lines, metric);
          break;
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export counter or gauge metric
   */
  private exportCounterOrGauge(lines: string[], metric: Counter | Gauge): void {
    if (metric.labelValues && metric.labelValues.size > 0) {
      for (const [labels, value] of metric.labelValues) {
        lines.push(`${metric.name}{${labels}} ${value}`);
      }
    } else if (metric.value !== 0 || !metric.labels) {
      lines.push(`${metric.name} ${metric.value}`);
    }
  }

  /**
   * Export histogram metric
   */
  private exportHistogram(lines: string[], metric: Histogram): void {
    if (metric.labelHistograms && metric.labelHistograms.size > 0) {
      for (const [labels, hist] of metric.labelHistograms) {
        let cumulative = 0;
        for (let i = 0; i < metric.buckets.length; i++) {
          const bucketValue = hist.values[i] ?? 0;
          cumulative += bucketValue;
          lines.push(`${metric.name}_bucket{${labels},le="${metric.buckets[i]}"} ${cumulative}`);
        }
        lines.push(`${metric.name}_bucket{${labels},le="+Inf"} ${hist.count}`);
        lines.push(`${metric.name}_sum{${labels}} ${hist.sum}`);
        lines.push(`${metric.name}_count{${labels}} ${hist.count}`);
      }
    } else if (metric.count > 0) {
      let cumulative = 0;
      for (let i = 0; i < metric.buckets.length; i++) {
        const bucketValue = metric.values[i] ?? 0;
        cumulative += bucketValue;
        lines.push(`${metric.name}_bucket{le="${metric.buckets[i]}"} ${cumulative}`);
      }
      lines.push(`${metric.name}_bucket{le="+Inf"} ${metric.count}`);
      lines.push(`${metric.name}_sum ${metric.sum}`);
      lines.push(`${metric.name}_count ${metric.count}`);
    }
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.metrics.clear();
    this.initializeMetrics();
  }
}

// Singleton instance
let metricsServiceInstance: MetricsService | null = null;

/**
 * Get the MetricsService singleton
 */
export function getMetricsService(): MetricsService {
  if (!metricsServiceInstance) {
    metricsServiceInstance = new MetricsService();
  }
  return metricsServiceInstance;
}

export default MetricsService;
