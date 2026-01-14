// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Telemetry Module - Public API
 *
 * Usage:
 *   import { telemetry, TelemetryEvent } from '../telemetry/index.js';
 *
 *   telemetry.initialize();
 *   telemetry.track(TelemetryEvent.WORKFLOW_START, { has_config: true });
 *   await telemetry.shutdown();
 */

export { telemetry, hashTargetUrl } from './telemetry-manager.js';
export { TelemetryEvent } from './telemetry-events.js';
export { getInstallationId } from './installation-id.js';
export type {
  BaseTelemetryProperties,
  AgentEventProperties,
  WorkflowEventProperties,
} from './telemetry-events.js';
export { loadTelemetryConfig } from './telemetry-config.js';
