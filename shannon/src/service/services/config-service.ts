/**
 * Config Service - Configuration discovery for Shannon Service
 * Provides dynamic configuration options for web UI forms
 */

/**
 * Field type for form generation
 */
export type FieldType = 'text' | 'password' | 'url' | 'number' | 'boolean' | 'select';

/**
 * Field definition for auth method configuration
 */
export interface AuthField {
  field: string;
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  placeholder?: string;
}

/**
 * Auth method configuration
 */
export interface AuthMethodConfig {
  id: string;
  name: string;
  description: string;
  requiredFields: AuthField[];
}

/**
 * Scan option configuration
 */
export interface ScanOptionConfig {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'boolean' | 'string' | 'select';
  default: string | number | boolean;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
}

/**
 * Phase configuration
 */
export interface PhaseConfig {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  order: number;
  agents?: string[];
}

/**
 * Auth methods configuration response
 */
export interface AuthMethodsResponse {
  methods: AuthMethodConfig[];
}

/**
 * Scan options configuration response
 */
export interface ScanOptionsResponse {
  options: ScanOptionConfig[];
}

/**
 * Phases configuration response
 */
export interface PhasesResponse {
  phases: PhaseConfig[];
}

/**
 * ConfigService - Provides configuration discovery for the web application
 * Enables dynamic form generation based on service capabilities
 */
export class ConfigService {
  /**
   * Get all supported authentication methods with their required fields
   */
  getAuthMethods(): AuthMethodsResponse {
    return {
      methods: AUTH_METHODS,
    };
  }

  /**
   * Get all configurable scan options with defaults and valid ranges
   */
  getScanOptions(): ScanOptionsResponse {
    return {
      options: SCAN_OPTIONS,
    };
  }

  /**
   * Get all scan phases with descriptions
   */
  getPhases(): PhasesResponse {
    return {
      phases: SCAN_PHASES,
    };
  }

  /**
   * Get a specific auth method by ID
   */
  getAuthMethod(id: string): AuthMethodConfig | undefined {
    return AUTH_METHODS.find((method) => method.id === id);
  }

  /**
   * Get a specific scan option by key
   */
  getScanOption(key: string): ScanOptionConfig | undefined {
    return SCAN_OPTIONS.find((option) => option.key === key);
  }

  /**
   * Get a specific phase by ID
   */
  getPhase(id: string): PhaseConfig | undefined {
    return SCAN_PHASES.find((phase) => phase.id === id);
  }

  /**
   * Validate auth method credentials have all required fields
   */
  validateAuthCredentials(
    methodId: string,
    credentials: Record<string, unknown>
  ): { valid: boolean; missingFields: string[] } {
    const method = this.getAuthMethod(methodId);
    if (!method) {
      return { valid: false, missingFields: ['Unknown auth method'] };
    }

    const missingFields: string[] = [];
    for (const field of method.requiredFields) {
      if (field.required && !credentials[field.field]) {
        missingFields.push(field.field);
      }
    }

    return {
      valid: missingFields.length === 0,
      missingFields,
    };
  }

  /**
   * Validate scan options against their constraints
   */
  validateScanOptions(
    options: Record<string, unknown>
  ): { valid: boolean; errors: Array<{ key: string; message: string }> } {
    const errors: Array<{ key: string; message: string }> = [];

    for (const [key, value] of Object.entries(options)) {
      const config = this.getScanOption(key);
      if (!config) {
        errors.push({ key, message: `Unknown option: ${key}` });
        continue;
      }

      if (config.type === 'number' && typeof value === 'number') {
        if (config.min !== undefined && value < config.min) {
          errors.push({ key, message: `Value must be >= ${config.min}` });
        }
        if (config.max !== undefined && value > config.max) {
          errors.push({ key, message: `Value must be <= ${config.max}` });
        }
      }

      if (config.type === 'select' && config.options) {
        const validValues = config.options.map((o) => o.value);
        if (!validValues.includes(value as string)) {
          errors.push({ key, message: `Invalid value. Must be one of: ${validValues.join(', ')}` });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get default scan configuration
   */
  getDefaultScanConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const option of SCAN_OPTIONS) {
      config[option.key] = option.default;
    }
    return config;
  }

  /**
   * Get default enabled phases
   */
  getDefaultEnabledPhases(): string[] {
    return SCAN_PHASES.filter((phase) => phase.defaultEnabled).map((phase) => phase.id);
  }
}

/**
 * Authentication method configurations
 * Defines all supported auth methods with their required credential fields
 */
const AUTH_METHODS: AuthMethodConfig[] = [
  {
    id: 'form',
    name: 'Form-Based Login',
    description: 'Traditional username/password form authentication',
    requiredFields: [
      {
        field: 'loginUrl',
        label: 'Login URL',
        type: 'url',
        required: true,
        description: 'Full URL of the login page',
        placeholder: 'https://example.com/login',
      },
      {
        field: 'usernameField',
        label: 'Username Field',
        type: 'text',
        required: true,
        description: 'Name or ID of the username input field',
        placeholder: 'username',
      },
      {
        field: 'passwordField',
        label: 'Password Field',
        type: 'text',
        required: true,
        description: 'Name or ID of the password input field',
        placeholder: 'password',
      },
      {
        field: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        description: 'Login username',
      },
      {
        field: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        description: 'Login password',
      },
      {
        field: 'submitSelector',
        label: 'Submit Button Selector',
        type: 'text',
        required: false,
        description: 'CSS selector for the submit button (optional)',
        placeholder: 'button[type="submit"]',
      },
      {
        field: 'successIndicator',
        label: 'Success Indicator',
        type: 'text',
        required: false,
        description: 'URL or text indicating successful login (optional)',
        placeholder: '/dashboard',
      },
    ],
  },
  {
    id: 'api_token',
    name: 'API Token',
    description: 'Token-based authentication via HTTP header',
    requiredFields: [
      {
        field: 'headerName',
        label: 'Header Name',
        type: 'text',
        required: true,
        description: 'HTTP header name for the token',
        placeholder: 'Authorization',
      },
      {
        field: 'token',
        label: 'Token Value',
        type: 'password',
        required: true,
        description: 'API token or bearer token value',
        placeholder: 'Bearer your-token-here',
      },
      {
        field: 'tokenPrefix',
        label: 'Token Prefix',
        type: 'text',
        required: false,
        description: 'Prefix to add before token (e.g., "Bearer ")',
        placeholder: 'Bearer ',
      },
    ],
  },
  {
    id: 'basic',
    name: 'HTTP Basic Auth',
    description: 'HTTP Basic authentication (RFC 7617)',
    requiredFields: [
      {
        field: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        description: 'Basic auth username',
      },
      {
        field: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        description: 'Basic auth password',
      },
    ],
  },
  {
    id: 'sso',
    name: 'SSO / OAuth',
    description: 'Single Sign-On via OAuth, SAML, or OIDC',
    requiredFields: [
      {
        field: 'provider',
        label: 'SSO Provider',
        type: 'select',
        required: true,
        description: 'SSO provider type',
      },
      {
        field: 'idpUrl',
        label: 'Identity Provider URL',
        type: 'url',
        required: true,
        description: 'URL of the identity provider',
        placeholder: 'https://login.provider.com',
      },
      {
        field: 'username',
        label: 'SSO Username',
        type: 'text',
        required: true,
        description: 'Username for SSO login',
      },
      {
        field: 'password',
        label: 'SSO Password',
        type: 'password',
        required: true,
        description: 'Password for SSO login',
      },
      {
        field: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: false,
        description: 'OAuth client ID (if applicable)',
      },
      {
        field: 'callbackUrl',
        label: 'Callback URL',
        type: 'url',
        required: false,
        description: 'OAuth callback URL (if applicable)',
      },
    ],
  },
];

/**
 * Scan option configurations
 * Defines all configurable scan parameters with defaults and constraints
 */
const SCAN_OPTIONS: ScanOptionConfig[] = [
  {
    key: 'timeout',
    label: 'Scan Timeout',
    description: 'Maximum scan duration in minutes. Scan will be cancelled if exceeded.',
    type: 'number',
    default: 120,
    min: 10,
    max: 480,
  },
  {
    key: 'maxConcurrentAgents',
    label: 'Concurrent Agents',
    description: 'Maximum number of vulnerability agents to run in parallel.',
    type: 'number',
    default: 5,
    min: 1,
    max: 10,
  },
  {
    key: 'maxAgentTurns',
    label: 'Max Agent Turns',
    description: 'Maximum AI conversation turns per agent. Higher values allow deeper analysis.',
    type: 'number',
    default: 10000,
    min: 100,
    max: 50000,
  },
  {
    key: 'retryAttempts',
    label: 'Retry Attempts',
    description: 'Number of retry attempts for failed agent activities.',
    type: 'number',
    default: 3,
    min: 0,
    max: 5,
  },
  {
    key: 'includeSourceAnalysis',
    label: 'Include Source Analysis',
    description: 'Analyze source code repository in addition to live testing.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'passiveMode',
    label: 'Passive Mode',
    description: 'Reconnaissance only - no active exploitation attempts.',
    type: 'boolean',
    default: false,
  },
  {
    key: 'scopeMode',
    label: 'Scope Mode',
    description: 'Control which URLs are in scope for testing.',
    type: 'select',
    default: 'domain',
    options: [
      { value: 'strict', label: 'Strict - Exact URL only' },
      { value: 'path', label: 'Path - URL and subpaths' },
      { value: 'domain', label: 'Domain - All same-domain URLs' },
      { value: 'subdomain', label: 'Subdomain - Include subdomains' },
    ],
  },
  {
    key: 'reportFormat',
    label: 'Default Report Format',
    description: 'Default format for generated reports.',
    type: 'select',
    default: 'PDF',
    options: [
      { value: 'PDF', label: 'PDF - Executive report' },
      { value: 'HTML', label: 'HTML - Interactive report' },
      { value: 'JSON', label: 'JSON - Machine-readable' },
      { value: 'SARIF', label: 'SARIF - Security tool format' },
    ],
  },
  {
    key: 'severityThreshold',
    label: 'Severity Threshold',
    description: 'Minimum severity level to report findings.',
    type: 'select',
    default: 'info',
    options: [
      { value: 'critical', label: 'Critical only' },
      { value: 'high', label: 'High and above' },
      { value: 'medium', label: 'Medium and above' },
      { value: 'low', label: 'Low and above' },
      { value: 'info', label: 'All findings (including info)' },
    ],
  },
];

/**
 * Scan phase configurations
 * Defines all phases of the penetration testing workflow
 */
const SCAN_PHASES: PhaseConfig[] = [
  {
    id: 'pre-recon',
    name: 'Pre-Reconnaissance',
    description:
      'Initial reconnaissance using external tools (nmap, subfinder, whatweb) and source code analysis. Discovers attack surface and technology stack.',
    defaultEnabled: true,
    order: 1,
    agents: ['pre-recon-tools', 'pre-recon-code'],
  },
  {
    id: 'recon',
    name: 'Reconnaissance',
    description:
      'AI-powered analysis of pre-reconnaissance findings. Maps attack surface, identifies endpoints, and prioritizes targets.',
    defaultEnabled: true,
    order: 2,
    agents: ['recon'],
  },
  {
    id: 'vuln',
    name: 'Vulnerability Analysis',
    description:
      'Parallel vulnerability scanning by specialized agents. Tests for injection, XSS, authentication, authorization, and SSRF vulnerabilities.',
    defaultEnabled: true,
    order: 3,
    agents: ['injection-vuln', 'xss-vuln', 'auth-vuln', 'authz-vuln', 'ssrf-vuln'],
  },
  {
    id: 'exploit',
    name: 'Exploitation',
    description:
      'Controlled exploitation of discovered vulnerabilities. Validates findings with proof-of-concept attacks. Only runs if vulnerabilities found.',
    defaultEnabled: true,
    order: 4,
    agents: ['injection-exploit', 'xss-exploit', 'auth-exploit', 'authz-exploit', 'ssrf-exploit'],
  },
  {
    id: 'report',
    name: 'Reporting',
    description:
      'Generates executive-level security report with findings, evidence, business impact, and remediation recommendations.',
    defaultEnabled: true,
    order: 5,
    agents: ['report'],
  },
];

// Singleton instance
let configServiceInstance: ConfigService | null = null;

/**
 * Get the ConfigService singleton
 */
export function getConfigService(): ConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ConfigService();
  }
  return configServiceInstance;
}

export default ConfigService;
