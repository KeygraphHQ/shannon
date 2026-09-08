// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

export const PRIVATE_FILES = [
  'traffic_inventory.json',
  'blackbox_blackboard.json',
  'blackbox_authz_findings.json',
  'blackbox_authz_evidence.md',
] as const;
export const SHARE_FILES = ['report.json', 'report.md'] as const;
export const MANIFEST_FILE = 'bundle-manifest.json';
export type BundleProfile = 'private' | 'sanitized';
export type JsonRecord = Record<string, unknown>;

export interface BundleIssue {
  readonly code: string;
  /** Only a fixed artifact filename, never an untrusted filesystem path. */
  readonly file?: string;
  /** Only fixed field names and numeric indices, never input values or object keys. */
  readonly location?: string;
  readonly message: string;
}

export interface PrivateBundleData {
  readonly blackboard: JsonRecord;
  readonly inventory: readonly JsonRecord[];
  readonly findings: readonly JsonRecord[];
  readonly markdown: string;
}

export interface BundleCheck {
  readonly schemaVersion: 1;
  readonly valid: boolean;
  readonly profile: BundleProfile | 'unknown';
  readonly integrity: 'matched' | 'unavailable' | 'failed';
  readonly authenticity: 'not-established';
  readonly issues: readonly BundleIssue[];
  readonly warnings: readonly string[];
}

export interface BundleManifest {
  readonly schemaVersion: 1;
  readonly profile: BundleProfile;
  readonly algorithm: 'sha256';
  readonly files: readonly { readonly name: string; readonly bytes: number; readonly sha256: string }[];
}
