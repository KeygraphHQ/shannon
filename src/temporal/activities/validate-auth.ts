/**
 * Auth Validation Temporal Activity
 *
 * Validates authentication configurations using Playwright.
 * Supports: Form-based login, API token, Basic Auth, TOTP
 */

import { heartbeat } from "@temporalio/activity";
import * as OTPAuth from "otpauth";

export interface AuthConfig {
  method: "NONE" | "FORM" | "API_TOKEN" | "BASIC" | "SSO";
  targetUrl: string;
  credentials: {
    username?: string;
    password?: string;
    apiToken?: string;
    totpSecret?: string;
  };
  // Form-based config
  loginUrl?: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  successIndicator?: string;
  // TOTP config
  totpEnabled?: boolean;
  totpSelector?: string;
}

export interface ValidationResult {
  valid: boolean;
  error: string | null;
  validatedAt: string;
  details?: {
    method: string;
    responseStatus?: number;
    successIndicatorFound?: boolean;
  };
}

const VALIDATION_TIMEOUT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 2000;

/**
 * Generate TOTP code from secret.
 */
export function generateTOTP(secret: string): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret.replace(/\s/g, "")),
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

/**
 * Validate authentication credentials.
 * Main activity function registered with Temporal.
 */
export async function validateAuthentication(
  config: AuthConfig
): Promise<ValidationResult> {
  const startTime = Date.now();
  const now = new Date().toISOString();

  // Heartbeat to indicate activity is alive
  const heartbeatInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    heartbeat({ activity: "validateAuthentication", elapsedSeconds: elapsed });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    if (config.method === "NONE") {
      return {
        valid: true,
        error: null,
        validatedAt: now,
        details: { method: "NONE" },
      };
    }

    let result: ValidationResult;

    switch (config.method) {
      case "FORM":
        result = await validateFormAuth(config);
        break;
      case "API_TOKEN":
        result = await validateApiToken(config);
        break;
      case "BASIC":
        result = await validateBasicAuth(config);
        break;
      case "SSO":
        result = {
          valid: false,
          error: "SSO validation requires manual verification",
          validatedAt: now,
          details: { method: "SSO" },
        };
        break;
      default:
        result = {
          valid: false,
          error: `Unknown auth method: ${config.method}`,
          validatedAt: now,
        };
    }

    return result;
  } finally {
    clearInterval(heartbeatInterval);
  }
}

/**
 * Validate form-based authentication using Playwright.
 */
async function validateFormAuth(config: AuthConfig): Promise<ValidationResult> {
  const now = new Date().toISOString();

  // Check required fields
  if (!config.loginUrl) {
    return {
      valid: false,
      error: "Login URL is not configured",
      validatedAt: now,
      details: { method: "FORM" },
    };
  }

  if (!config.credentials.username || !config.credentials.password) {
    return {
      valid: false,
      error: "Username and password are required",
      validatedAt: now,
      details: { method: "FORM" },
    };
  }

  if (
    !config.usernameSelector ||
    !config.passwordSelector ||
    !config.submitSelector
  ) {
    return {
      valid: false,
      error:
        "CSS selectors for username, password, and submit button are required",
      validatedAt: now,
      details: { method: "FORM" },
    };
  }

  try {
    // Dynamic import for Playwright (only loaded when needed)
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      // Navigate to login page
      await page.goto(config.loginUrl, {
        timeout: VALIDATION_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
      });

      // Fill username
      await page.fill(config.usernameSelector, config.credentials.username);

      // Fill password
      await page.fill(config.passwordSelector, config.credentials.password);

      // Handle TOTP if enabled
      if (
        config.totpEnabled &&
        config.totpSelector &&
        config.credentials.totpSecret
      ) {
        const totpCode = generateTOTP(config.credentials.totpSecret);
        await page.fill(config.totpSelector, totpCode);
      }

      // Click submit
      await page.click(config.submitSelector);

      // Wait for navigation or success indicator
      if (config.successIndicator) {
        try {
          await page.waitForSelector(config.successIndicator, {
            timeout: 10000,
          });
          return {
            valid: true,
            error: null,
            validatedAt: now,
            details: { method: "FORM", successIndicatorFound: true },
          };
        } catch {
          return {
            valid: false,
            error:
              "Login submitted but success indicator not found. Check credentials or success selector.",
            validatedAt: now,
            details: { method: "FORM", successIndicatorFound: false },
          };
        }
      } else {
        // No success indicator - wait for navigation and check URL changed
        await page.waitForLoadState("networkidle", { timeout: 10000 });
        const currentUrl = page.url();

        // Simple heuristic: URL should be different from login URL after successful login
        if (currentUrl !== config.loginUrl) {
          return {
            valid: true,
            error: null,
            validatedAt: now,
            details: { method: "FORM" },
          };
        } else {
          return {
            valid: false,
            error: "Login may have failed - still on login page after submit",
            validatedAt: now,
            details: { method: "FORM" },
          };
        }
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    return {
      valid: false,
      error: `Form validation failed: ${err instanceof Error ? err.message : String(err)}`,
      validatedAt: now,
      details: { method: "FORM" },
    };
  }
}

/**
 * Validate API token authentication.
 */
async function validateApiToken(config: AuthConfig): Promise<ValidationResult> {
  const now = new Date().toISOString();

  if (!config.credentials.apiToken) {
    return {
      valid: false,
      error: "API token is required",
      validatedAt: now,
      details: { method: "API_TOKEN" },
    };
  }

  try {
    const response = await fetch(config.targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.credentials.apiToken}`,
      },
      redirect: "follow",
    });

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        error: "Invalid API token - authentication rejected",
        validatedAt: now,
        details: { method: "API_TOKEN", responseStatus: response.status },
      };
    }

    return {
      valid: true,
      error: null,
      validatedAt: now,
      details: { method: "API_TOKEN", responseStatus: response.status },
    };
  } catch (err) {
    return {
      valid: false,
      error: `API token validation failed: ${err instanceof Error ? err.message : String(err)}`,
      validatedAt: now,
      details: { method: "API_TOKEN" },
    };
  }
}

/**
 * Validate HTTP Basic authentication.
 */
async function validateBasicAuth(config: AuthConfig): Promise<ValidationResult> {
  const now = new Date().toISOString();

  if (!config.credentials.username || !config.credentials.password) {
    return {
      valid: false,
      error: "Username and password are required",
      validatedAt: now,
      details: { method: "BASIC" },
    };
  }

  try {
    const basicAuth = Buffer.from(
      `${config.credentials.username}:${config.credentials.password}`
    ).toString("base64");

    const response = await fetch(config.targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
      redirect: "follow",
    });

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        error: "Invalid credentials - authentication rejected",
        validatedAt: now,
        details: { method: "BASIC", responseStatus: response.status },
      };
    }

    return {
      valid: true,
      error: null,
      validatedAt: now,
      details: { method: "BASIC", responseStatus: response.status },
    };
  } catch (err) {
    return {
      valid: false,
      error: `Basic auth validation failed: ${err instanceof Error ? err.message : String(err)}`,
      validatedAt: now,
      details: { method: "BASIC" },
    };
  }
}
