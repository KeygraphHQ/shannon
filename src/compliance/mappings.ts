// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { FindingCompliance, FindingInput } from '../findings/types.js';

export const OWASP_TOP10_2021 = [
  { id: 'A01', name: 'Broken Access Control' },
  { id: 'A02', name: 'Cryptographic Failures' },
  { id: 'A03', name: 'Injection' },
  { id: 'A04', name: 'Insecure Design' },
  { id: 'A05', name: 'Security Misconfiguration' },
  { id: 'A06', name: 'Vulnerable and Outdated Components' },
  { id: 'A07', name: 'Identification and Authentication Failures' },
  { id: 'A08', name: 'Software and Data Integrity Failures' },
  { id: 'A09', name: 'Security Logging and Monitoring Failures' },
  { id: 'A10', name: 'Server-Side Request Forgery (SSRF)' },
] as const;

export const PCI_DSS_V4_REQUIREMENTS = [
  { id: '1', name: 'Install and maintain network security controls' },
  { id: '2', name: 'Apply secure configurations to all system components' },
  { id: '3', name: 'Protect stored account data' },
  { id: '4', name: 'Protect cardholder data with strong cryptography during transmission' },
  { id: '5', name: 'Protect all systems and networks from malicious software' },
  { id: '6', name: 'Develop and maintain secure systems and software' },
  { id: '7', name: 'Restrict access to system components and cardholder data by business need to know' },
  { id: '8', name: 'Identify users and authenticate access to system components' },
  { id: '9', name: 'Restrict physical access to cardholder data' },
  { id: '10', name: 'Log and monitor all access to system components and cardholder data' },
  { id: '11', name: 'Test security of systems and networks regularly' },
  { id: '12', name: 'Support information security with organizational policies and programs' },
] as const;

export const SOC2_TSC_CATEGORIES = [
  'Security',
  'Availability',
  'ProcessingIntegrity',
  'Confidentiality',
  'Privacy',
] as const;

const unique = (items: string[]): string[] => Array.from(new Set(items));

const normalizeText = (value: string): string => value.toLowerCase();

export const mapFindingToCompliance = (finding: FindingInput): FindingCompliance => {
  const category = normalizeText(finding.category || '');
  const title = normalizeText(finding.title || '');
  const tags = (finding.tags || []).map(normalizeText);
  const text = `${category} ${title} ${tags.join(' ')}`;

  const owasp: string[] = [];
  const pci: string[] = [];
  const soc2: string[] = [];

  if (text.includes('authz') || text.includes('authorization') || text.includes('access control')) {
    owasp.push('A01');
    pci.push('7');
    soc2.push('Security');
  }

  if (text.includes('auth') || text.includes('authentication') || text.includes('login')) {
    owasp.push('A07');
    pci.push('8');
    soc2.push('Security');
  }

  if (text.includes('ssrf')) {
    owasp.push('A10');
    pci.push('1', '6');
    soc2.push('Security');
  }

  if (text.includes('xss') || text.includes('cross-site scripting') || text.includes('injection')) {
    owasp.push('A03');
    pci.push('6');
    soc2.push('Security');
  }

  if (text.includes('sql') || text.includes('command injection')) {
    owasp.push('A03');
    pci.push('6');
    soc2.push('Security');
  }

  if (text.includes('logging') || text.includes('monitoring')) {
    owasp.push('A09');
    pci.push('10');
    soc2.push('Security');
  }

  if (text.includes('crypto') || text.includes('encryption') || text.includes('tls')) {
    owasp.push('A02');
    pci.push('3', '4');
    soc2.push('Confidentiality');
  }

  return {
    owasp_top10_2021: unique(owasp),
    pci_dss_v4: unique(pci),
    soc2_tsc: unique(soc2),
  };
};
