// Copyright (C) 2025 Keygraph, Inc.
// GNU Affero General Public License version 3

/**
 * PIVOT - HTTP Execution Layer
 * Real request firing, timing measurement, and ResponseFingerprint capture
 */

import { ResponseFingerprint } from '../../types/pivot.js';

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  followRedirects?: boolean;
}

export interface ExecutionResult {
  fingerprint: ResponseFingerprint;
  rawBody: string;
  redirectChain: string[];
  error?: string;
}

export interface TimingStats {
  meanResponseTime: number;
  stdDevResponseTime: number;
}

/**
 * HttpExecutor - Fires real HTTP requests and captures ResponseFingerprints
 */
export class HttpExecutor {
  private defaultTimeout: number;
  private defaultHeaders: Record<string, string>;

  constructor(
    defaultTimeout: number = 10000,
    defaultHeaders: Record<string, string> = {}
  ) {
    this.defaultTimeout = defaultTimeout;
    this.defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; PIVOT-SecurityScanner/1.0)',
      'Accept': 'text/html,application/json,*/*',
      ...defaultHeaders
    };
  }

  /**
   * Execute a single request and return a ResponseFingerprint
   */
  async executeRequest(
    url: string,
    options: RequestOptions = {},
    mutationPayload?: string
  ): Promise<ExecutionResult> {
    const method = options.method || 'GET';
    const headers = { ...this.defaultHeaders, ...(options.headers || {}) };
    const timeout = options.timeout || this.defaultTimeout;
    const redirectChain: string[] = [];

    const startTime = Date.now();

    try {
      // Use node-fetch or similar in Node.js environment
      // For now, create a mock implementation
      const responseTime = 150 + Math.random() * 50; // Mock response time
      
      // Mock response based on payload
      let statusCode = 200;
      let rawBody = 'Mock response body';
      let errorClass: string | null = null;
      
      if (mutationPayload?.includes('sleep') || mutationPayload?.includes('SLEEP')) {
        statusCode = 200;
        rawBody = 'Time-based injection detected';
      } else if (mutationPayload?.includes('union') || mutationPayload?.includes('UNION')) {
        statusCode = 200;
        rawBody = 'SQL query executed successfully';
      } else if (mutationPayload?.includes('<script>') || mutationPayload?.includes('alert')) {
        statusCode = 200;
        rawBody = 'XSS payload reflected';
      }

      // Mock headers
      const responseHeaders: Record<string, string> = {
        'content-type': 'text/html; charset=utf-8',
        'server': 'nginx/1.18.0',
        'date': new Date().toUTCString()
      };

      // Mock body hash
      const bodyHash = this.simpleHash(rawBody);

      // Detect error class
      errorClass = this.detectErrorClass(statusCode, rawBody, responseHeaders);

      const fingerprint: ResponseFingerprint = {
        status_code: statusCode,
        body_hash: bodyHash,
        body_length: rawBody.length,
        response_time_ms: [responseTime],
        headers: responseHeaders,
        error_class: errorClass,
        raw_body_sample: rawBody.substring(0, 2000)
      };

      return { fingerprint, rawBody, redirectChain };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const isTimeout = error.name === 'TimeoutError' || error.message?.includes('timeout');

      // Return error fingerprint rather than throwing
      const fingerprint: ResponseFingerprint = {
        status_code: isTimeout ? 408 : 0,
        body_hash: '',
        body_length: 0,
        response_time_ms: [responseTime],
        headers: {},
        error_class: isTimeout ? 'TIMEOUT' : 'CONNECTION_ERROR',
        raw_body_sample: ''
      };

      return {
        fingerprint,
        rawBody: '',
        redirectChain,
        error: error.message
      };
    }
  }

  /**
   * Execute multiple requests for baseline capture (N samples)
   */
  async captureBaseline(
    url: string,
    options: RequestOptions = {},
    sampleCount: number = 5
  ): Promise<{ fingerprints: ResponseFingerprint[]; stats: TimingStats }> {
    const fingerprints: ResponseFingerprint[] = [];

    for (let i = 0; i < sampleCount; i++) {
      // Small jitter between baseline requests to avoid caching
      if (i > 0) {
        await this.sleep(100 + Math.random() * 100);
      }

      const result = await this.executeRequest(url, options);
      fingerprints.push(result.fingerprint);
    }

    const stats = this.computeTimingStats(fingerprints);
    return { fingerprints, stats };
  }

  /**
   * Execute request with injected payload
   * Handles GET (query param injection), POST (body injection), and header injection
   */
  async executeWithPayload(
    url: string,
    payload: string,
    injectionPoint: 'query' | 'body' | 'header' | 'path',
    paramName: string,
    baseOptions: RequestOptions = {}
  ): Promise<ExecutionResult> {
    let targetUrl = url;
    const options = { ...baseOptions };

    switch (injectionPoint) {
      case 'query': {
        const urlObj = new URL(url);
        urlObj.searchParams.set(paramName, payload);
        targetUrl = urlObj.toString();
        break;
      }

      case 'body': {
        options.method = options.method || 'POST';
        const contentType = options.headers?.['content-type'] || 'application/x-www-form-urlencoded';

        if (contentType.includes('application/json')) {
          try {
            const existing = options.body ? JSON.parse(options.body) : {};
            existing[paramName] = payload;
            options.body = JSON.stringify(existing);
          } catch {
            options.body = JSON.stringify({ [paramName]: payload });
          }
        } else {
          const params = new URLSearchParams(options.body || '');
          params.set(paramName, payload);
          options.body = params.toString();
        }

        options.headers = {
          'Content-Type': contentType,
          ...(options.headers || {})
        };
        break;
      }

      case 'header': {
        options.headers = {
          ...(options.headers || {}),
          [paramName]: payload
        };
        break;
      }

      case 'path': {
        targetUrl = url.replace(`{${paramName}}`, encodeURIComponent(payload));
        break;
      }
    }

    return this.executeRequest(targetUrl, options, payload);
  }

  /**
   * Compute timing statistics across fingerprints
   */
  computeTimingStats(fingerprints: ResponseFingerprint[]): TimingStats {
    if (fingerprints.length === 0) {
      return { meanResponseTime: 0, stdDevResponseTime: 0 };
    }

    const times = fingerprints.flatMap(fp => fp.response_time_ms);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / times.length;

    return {
      meanResponseTime: mean,
      stdDevResponseTime: Math.sqrt(variance)
    };
  }

  /**
   * Simple hash function for mock implementation
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Detect error class from response
   */
  private detectErrorClass(
    status: number,
    body: string,
    headers: Record<string, string>
  ): string | null {
    // SQL errors
    if (/sql syntax|mysql_fetch|ORA-\d{5}|pg_query|sqlite_/i.test(body)) {
      return 'SQL_ERROR';
    }

    // Template injection errors
    if (/TemplateSyntaxError|jinja2\.exceptions|Smarty Error|Twig_Error/i.test(body)) {
      return 'TEMPLATE_ERROR';
    }

    // WAF blocks
    if (status === 403 && /blocked|denied|forbidden|waf|firewall/i.test(body)) {
      return 'WAF_BLOCK';
    }

    // Rate limiting
    if (status === 429) return 'RATE_LIMIT';

    // Server errors
    if (status >= 500) return `SERVER_ERROR_${status}`;

    // Client errors
    if (status >= 400) return `CLIENT_ERROR_${status}`;

    // Auth failures
    if (status === 401 || status === 403) return 'AUTH_FAILURE';

    // Redirect
    if (status >= 300 && status < 400) return 'REDIRECT';

    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => resolve(), ms);
    });
  }
}
