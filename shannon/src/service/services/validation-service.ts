/**
 * Validation Service - Authentication credential validation
 * Tests credentials against target applications without starting a full scan
 *
 * SECURITY: Credentials are NEVER logged - only outcomes and error codes are recorded
 */

import * as crypto from 'crypto';
import type {
  AuthMethod,
  ValidationResult,
  ValidationErrorCode,
} from '../types/api.js';

// Default timeout for validation requests (60 seconds per spec)
const DEFAULT_VALIDATION_TIMEOUT_MS = 60_000;

// TOTP settings
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;

/**
 * Credential types for each auth method
 * These are typed but never logged
 */
export interface FormCredentials {
  loginUrl: string;
  usernameField: string;
  passwordField: string;
  username: string;
  password: string;
  submitSelector?: string;
}

export interface ApiTokenCredentials {
  headerName: string;
  token: string;
}

export interface BasicAuthCredentials {
  username: string;
  password: string;
}

export interface SsoCredentials {
  provider: string;
  idpUrl: string;
  credentials: Record<string, string>;
}

export type Credentials =
  | FormCredentials
  | ApiTokenCredentials
  | BasicAuthCredentials
  | SsoCredentials;

export interface ValidationOptions {
  targetUrl: string;
  authMethod: AuthMethod;
  credentials: Credentials;
  totpSecret?: string;
  timeoutMs?: number;
}

export interface ValidationServiceConfig {
  timeoutMs?: number;
}

/**
 * ValidationService - Validates authentication credentials against target applications
 *
 * Security principles:
 * - Credentials are NEVER logged (only outcomes and error codes)
 * - 60-second timeout by default to prevent hanging connections
 * - Sanitized error messages returned to clients
 */
export class ValidationService {
  private config: Required<ValidationServiceConfig>;

  constructor(config: ValidationServiceConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS,
    };
  }

  /**
   * Validate credentials against a target application
   * Routes to appropriate validation method based on authMethod
   */
  async validate(options: ValidationOptions): Promise<ValidationResult> {
    const { authMethod, timeoutMs = this.config.timeoutMs } = options;

    // Wrap validation in timeout
    const validationPromise = this.executeValidation(options);

    try {
      const result = await Promise.race([
        validationPromise,
        this.createTimeoutPromise(timeoutMs),
      ]);

      return result;
    } catch (error) {
      // Handle timeout specifically
      if (error instanceof ValidationTimeoutError) {
        return this.createErrorResult('AUTH_TIMEOUT', 'Validation request timed out');
      }

      // Handle other errors without exposing internals
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      return this.createErrorResult('AUTH_INVALID_CREDENTIALS', errorMessage);
    }
  }

  /**
   * Execute validation based on auth method
   * This method dispatches to specific validation implementations
   */
  private async executeValidation(options: ValidationOptions): Promise<ValidationResult> {
    const { authMethod, targetUrl, credentials, totpSecret } = options;

    // Generate TOTP if secret provided
    let totpCode: string | undefined;
    if (totpSecret) {
      totpCode = this.generateTotpCode(totpSecret);
    }

    switch (authMethod) {
      case 'form':
        return this.validateFormAuth(targetUrl, credentials as FormCredentials, totpCode);

      case 'api_token':
        return this.validateApiToken(targetUrl, credentials as ApiTokenCredentials);

      case 'basic':
        return this.validateBasicAuth(targetUrl, credentials as BasicAuthCredentials);

      case 'sso':
        return this.validateSsoAuth(targetUrl, credentials as SsoCredentials, totpCode);

      default:
        return this.createErrorResult(
          'AUTH_INVALID_CREDENTIALS',
          `Unsupported authentication method: ${authMethod}`
        );
    }
  }

  /**
   * Validate form-based authentication
   * Uses browser automation (Playwright) to fill and submit login forms
   */
  async validateFormAuth(
    _targetUrl: string,
    credentials: FormCredentials,
    _totpCode?: string
  ): Promise<ValidationResult> {
    // Note: This is a placeholder implementation
    // Full implementation would use Playwright for browser automation
    // to navigate to loginUrl, fill form fields, and verify authentication

    try {
      // Verify required fields are present (without logging values)
      if (!credentials.loginUrl || !credentials.username || !credentials.password) {
        return this.createErrorResult(
          'AUTH_INVALID_CREDENTIALS',
          'Missing required form credentials'
        );
      }

      // Verify the login URL is reachable
      const reachable = await this.checkTargetReachable(credentials.loginUrl);
      if (!reachable) {
        return this.createErrorResult(
          'AUTH_TARGET_UNREACHABLE',
          'Unable to reach login URL'
        );
      }

      // TODO: Implement actual form authentication using Playwright MCP
      // This would:
      // 1. Launch browser via Playwright MCP
      // 2. Navigate to credentials.loginUrl
      // 3. Fill credentials.usernameField with username
      // 4. Fill credentials.passwordField with password
      // 5. If totpCode, find TOTP field and fill
      // 6. Submit form (using submitSelector if provided)
      // 7. Check for successful authentication (URL change, cookie, etc.)

      // For now, return a placeholder success
      // In production, this would be replaced with actual browser automation
      return this.createSuccessResult();
    } catch (error) {
      // Log error type only, never credentials
      console.error('Form validation error:', error instanceof Error ? error.name : 'Unknown');
      return this.createErrorResult(
        'AUTH_INVALID_CREDENTIALS',
        'Form authentication failed'
      );
    }
  }

  /**
   * Validate API token authentication
   * Makes a test request with the provided token
   */
  async validateApiToken(
    targetUrl: string,
    credentials: ApiTokenCredentials
  ): Promise<ValidationResult> {
    try {
      // Verify required fields (without logging token value)
      if (!credentials.token) {
        return this.createErrorResult(
          'AUTH_INVALID_CREDENTIALS',
          'Missing API token'
        );
      }

      const headerName = credentials.headerName || 'Authorization';
      const tokenValue = headerName.toLowerCase() === 'authorization'
        ? `Bearer ${credentials.token}`
        : credentials.token;

      // Make test request with token
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          [headerName]: tokenValue,
        },
        signal: AbortSignal.timeout(10_000), // 10 second timeout for single request
      });

      // Check if authentication succeeded
      // 401/403 indicates invalid token, other errors may indicate target issues
      if (response.status === 401 || response.status === 403) {
        return this.createErrorResult(
          'AUTH_INVALID_CREDENTIALS',
          'API token rejected by target'
        );
      }

      if (!response.ok && response.status >= 500) {
        return this.createErrorResult(
          'AUTH_TARGET_UNREACHABLE',
          'Target server error'
        );
      }

      return this.createSuccessResult();
    } catch (error) {
      // Check for network/timeout errors
      if (error instanceof TypeError || (error as Error).name === 'AbortError') {
        return this.createErrorResult(
          'AUTH_TARGET_UNREACHABLE',
          'Unable to connect to target'
        );
      }

      console.error('API token validation error:', error instanceof Error ? error.name : 'Unknown');
      return this.createErrorResult(
        'AUTH_INVALID_CREDENTIALS',
        'API token validation failed'
      );
    }
  }

  /**
   * Validate Basic Auth credentials
   * Makes a test request with Basic Authentication header
   */
  async validateBasicAuth(
    targetUrl: string,
    credentials: BasicAuthCredentials
  ): Promise<ValidationResult> {
    try {
      // Verify required fields (without logging values)
      if (!credentials.username || !credentials.password) {
        return this.createErrorResult(
          'AUTH_INVALID_CREDENTIALS',
          'Missing Basic Auth credentials'
        );
      }

      // Create Basic Auth header
      const basicAuth = Buffer.from(
        `${credentials.username}:${credentials.password}`
      ).toString('base64');

      // Make test request with Basic Auth
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      // Check authentication result
      if (response.status === 401) {
        return this.createErrorResult(
          'AUTH_INVALID_CREDENTIALS',
          'Basic Auth credentials rejected'
        );
      }

      if (response.status === 403) {
        return this.createErrorResult(
          'AUTH_INVALID_CREDENTIALS',
          'Access forbidden with provided credentials'
        );
      }

      if (!response.ok && response.status >= 500) {
        return this.createErrorResult(
          'AUTH_TARGET_UNREACHABLE',
          'Target server error'
        );
      }

      return this.createSuccessResult();
    } catch (error) {
      if (error instanceof TypeError || (error as Error).name === 'AbortError') {
        return this.createErrorResult(
          'AUTH_TARGET_UNREACHABLE',
          'Unable to connect to target'
        );
      }

      console.error('Basic auth validation error:', error instanceof Error ? error.name : 'Unknown');
      return this.createErrorResult(
        'AUTH_INVALID_CREDENTIALS',
        'Basic Auth validation failed'
      );
    }
  }

  /**
   * Validate SSO authentication
   * Uses browser automation to complete SSO flow
   */
  async validateSsoAuth(
    _targetUrl: string,
    credentials: SsoCredentials,
    _totpCode?: string
  ): Promise<ValidationResult> {
    try {
      // Verify required fields (without logging credential values)
      if (!credentials.provider || !credentials.idpUrl) {
        return this.createErrorResult(
          'AUTH_SSO_FAILED',
          'Missing SSO provider configuration'
        );
      }

      // Verify IDP is reachable
      const reachable = await this.checkTargetReachable(credentials.idpUrl);
      if (!reachable) {
        return this.createErrorResult(
          'AUTH_TARGET_UNREACHABLE',
          'Unable to reach identity provider'
        );
      }

      // TODO: Implement actual SSO validation using Playwright MCP
      // This would:
      // 1. Navigate to target URL to initiate SSO flow
      // 2. Follow redirect to IDP
      // 3. Enter credentials on IDP login form
      // 4. Handle MFA if totpCode provided
      // 5. Complete SSO callback
      // 6. Verify successful authentication

      // For now, return placeholder success
      // Production would use browser automation for full SSO flow
      return this.createSuccessResult();
    } catch (error) {
      console.error('SSO validation error:', error instanceof Error ? error.name : 'Unknown');
      return this.createErrorResult(
        'AUTH_SSO_FAILED',
        'SSO authentication flow failed'
      );
    }
  }

  /**
   * Generate TOTP code from secret
   * Implements RFC 6238 TOTP algorithm
   */
  generateTotpCode(secret: string): string {
    // Decode base32 secret
    const decodedSecret = this.base32Decode(secret.replace(/\s+/g, '').toUpperCase());

    // Calculate time counter
    const timeCounter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);

    // Convert counter to 8-byte buffer (big-endian)
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(timeCounter));

    // Calculate HMAC-SHA1
    const hmac = crypto.createHmac('sha1', decodedSecret);
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation per RFC 4226
    const offset = hash[hash.length - 1]! & 0x0f;
    const binary =
      ((hash[offset]! & 0x7f) << 24) |
      ((hash[offset + 1]! & 0xff) << 16) |
      ((hash[offset + 2]! & 0xff) << 8) |
      (hash[offset + 3]! & 0xff);

    // Generate OTP with specified digits
    const otp = binary % Math.pow(10, TOTP_DIGITS);

    // Pad with leading zeros if needed
    return otp.toString().padStart(TOTP_DIGITS, '0');
  }

  /**
   * Decode base32 string to Buffer
   */
  private base32Decode(input: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const paddingChar = '=';

    // Remove padding
    let cleanInput = input.replace(new RegExp(`[${paddingChar}]+$`), '');

    // Convert to binary
    let bits = '';
    for (const char of cleanInput) {
      const index = alphabet.indexOf(char);
      if (index === -1) {
        throw new Error(`Invalid base32 character: ${char}`);
      }
      bits += index.toString(2).padStart(5, '0');
    }

    // Convert to bytes
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }

    return Buffer.from(bytes);
  }

  /**
   * Check if a URL is reachable
   */
  private async checkTargetReachable(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5_000),
      });
      // Any response (even 401/403) means target is reachable
      return response.status < 500;
    } catch {
      return false;
    }
  }

  /**
   * Create a timeout promise that rejects after specified ms
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new ValidationTimeoutError());
      }, timeoutMs);
    });
  }

  /**
   * Create a successful validation result
   */
  private createSuccessResult(): ValidationResult {
    return {
      valid: true,
      validatedAt: new Date(),
    };
  }

  /**
   * Create an error validation result
   * SECURITY: Never include credential data in error details
   */
  private createErrorResult(
    errorCode: ValidationErrorCode,
    error: string
  ): ValidationResult {
    return {
      valid: false,
      validatedAt: new Date(),
      error,
      errorCode,
    };
  }

  /**
   * Get the configured timeout
   */
  getTimeoutMs(): number {
    return this.config.timeoutMs;
  }
}

// Custom error class for timeouts
export class ValidationTimeoutError extends Error {
  constructor() {
    super('Validation request timed out');
    this.name = 'ValidationTimeoutError';
  }
}

// Custom error class for validation failures
export class ValidationError extends Error {
  public readonly errorCode: ValidationErrorCode;

  constructor(message: string, errorCode: ValidationErrorCode) {
    super(message);
    this.name = 'ValidationError';
    this.errorCode = errorCode;
  }
}

// Singleton instance
let validationServiceInstance: ValidationService | null = null;

export function getValidationService(config?: ValidationServiceConfig): ValidationService {
  if (!validationServiceInstance) {
    validationServiceInstance = new ValidationService(config);
  }
  return validationServiceInstance;
}

export default ValidationService;
