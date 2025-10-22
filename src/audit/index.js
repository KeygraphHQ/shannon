/**
 * Unified Audit & Metrics System
 *
 * Public API for the audit system. Provides crash-safe, append-only logging
 * and comprehensive metrics tracking for Shannon penetration testing sessions.
 *
 * IMPORTANT: Session objects must have an 'id' field (NOT 'sessionId')
 * Example: { id: "uuid", webUrl: "...", repoPath: "..." }
 *
 * @module audit
 */

export { AuditSession } from './audit-session.js';
export { AgentLogger } from './logger.js';
export { MetricsTracker } from './metrics-tracker.js';
export * as AuditUtils from './utils.js';
