// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Get the actual model name being used.
 * When using claude-code-router, the SDK reports its configured model (claude-sonnet)
 * but the actual model is determined by ROUTER_DEFAULT env var.
 */
export function getActualModelName(sdkReportedModel?: string): string | undefined {
  const routerBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const routerDefault = process.env.ROUTER_DEFAULT;

  // If router mode is active and ROUTER_DEFAULT is set, use that
  if (routerBaseUrl && routerDefault) {
    // ROUTER_DEFAULT format: "provider,model" (e.g., "gemini,gemini-2.5-pro")
    const parts = routerDefault.split(',');
    if (parts.length >= 2) {
      return parts.slice(1).join(','); // Handle model names with commas
    }
  }

  // Fall back to SDK-reported model
  return sdkReportedModel;
}

/**
 * Check if router mode is active.
 */
export function isRouterMode(): boolean {
  return !!process.env.ANTHROPIC_BASE_URL && !!process.env.ROUTER_DEFAULT;
}
