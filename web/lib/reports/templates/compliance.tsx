/**
 * Compliance Report PDF Template.
 * Compliance-focused view for auditors.
 * Focus: Framework mappings, control coverage, compliance gaps.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ReportData } from './types';
import { SEVERITY_COLORS } from './types';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1F2937',
  },
  header: {
    marginBottom: 25,
    borderBottomWidth: 2,
    borderBottomColor: '#7C3AED',
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#6B7280',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 2,
  },
  frameworkCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 15,
    overflow: 'hidden',
  },
  frameworkHeader: {
    backgroundColor: '#7C3AED',
    padding: 10,
  },
  frameworkTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  frameworkBody: {
    padding: 10,
  },
  controlRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingVertical: 8,
  },
  controlId: {
    width: '15%',
    fontSize: 8,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  controlName: {
    width: '45%',
    fontSize: 8,
  },
  controlStatus: {
    width: '20%',
    fontSize: 8,
  },
  controlFindings: {
    width: '20%',
    fontSize: 8,
    textAlign: 'right',
  },
  statusBadge: {
    fontSize: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 2,
    alignSelf: 'flex-start',
  },
  complianceScore: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    padding: 15,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
  },
  scoreItem: {
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scoreLabel: {
    fontSize: 8,
    color: '#6B7280',
    marginTop: 4,
  },
  findingMapping: {
    backgroundColor: '#F9FAFB',
    padding: 8,
    marginBottom: 8,
    borderRadius: 2,
    borderLeftWidth: 3,
  },
  mappingTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  mappingControls: {
    fontSize: 8,
    color: '#6B7280',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#9CA3AF',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  disclaimer: {
    fontSize: 8,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 20,
    padding: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    padding: 8,
    fontWeight: 'bold',
    fontSize: 8,
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 4,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
});

// Placeholder framework data - will be populated from compliance mapping in Phase 4
const FRAMEWORK_PLACEHOLDERS = {
  'owasp-top-10-2021': {
    name: 'OWASP Top 10 (2021)',
    controls: [
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
    ],
  },
};

// Map categories to framework controls (simplified mapping)
const CATEGORY_TO_CONTROL: Record<string, string[]> = {
  injection: ['A03'],
  xss: ['A03'],
  auth: ['A07'],
  authz: ['A01'],
  ssrf: ['A10'],
  crypto: ['A02'],
  config: ['A05'],
};

export function ComplianceReport({ data }: { data: ReportData }) {
  // Calculate compliance metrics based on findings
  const frameworks = data.metadata.frameworkIds || ['owasp-top-10-2021'];

  // Map findings to controls based on category
  const findingsByControl = new Map<string, typeof data.findings>();
  data.findings.forEach((finding) => {
    const controls = CATEGORY_TO_CONTROL[finding.category] || [];
    controls.forEach((controlId) => {
      const existing = findingsByControl.get(controlId) || [];
      existing.push(finding);
      findingsByControl.set(controlId, existing);
    });
  });

  // Calculate compliance metrics
  const totalControls = FRAMEWORK_PLACEHOLDERS['owasp-top-10-2021'].controls.length;
  const controlsWithFindings = findingsByControl.size;
  const passedControls = totalControls - controlsWithFindings;
  const compliancePercentage = Math.round((passedControls / totalControls) * 100);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{data.metadata.title}</Text>
          <Text style={styles.subtitle}>Compliance Assessment Report</Text>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={{ fontSize: 9, fontWeight: 'bold', marginBottom: 4 }}>
            About This Report
          </Text>
          <Text style={{ fontSize: 8, lineHeight: 1.5 }}>
            This report maps security findings to compliance framework controls. It is intended to
            assist with compliance assessments but does not constitute a formal compliance audit.
            Consult qualified auditors for official compliance certifications.
          </Text>
        </View>

        {/* Compliance Score Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compliance Overview</Text>
          <View style={styles.complianceScore}>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreValue, { color: '#10B981' }]}>{compliancePercentage}%</Text>
              <Text style={styles.scoreLabel}>Compliance Score</Text>
            </View>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreValue, { color: '#10B981' }]}>{passedControls}</Text>
              <Text style={styles.scoreLabel}>Controls Passed</Text>
            </View>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreValue, { color: '#DC2626' }]}>{controlsWithFindings}</Text>
              <Text style={styles.scoreLabel}>Controls with Issues</Text>
            </View>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreValue, { color: '#111827' }]}>{data.summary.total}</Text>
              <Text style={styles.scoreLabel}>Total Findings</Text>
            </View>
          </View>
        </View>

        {/* Framework Control Status */}
        {frameworks.map((frameworkId) => {
          const framework =
            FRAMEWORK_PLACEHOLDERS[frameworkId as keyof typeof FRAMEWORK_PLACEHOLDERS];
          if (!framework) return null;

          return (
            <View key={frameworkId} style={styles.frameworkCard}>
              <View style={styles.frameworkHeader}>
                <Text style={styles.frameworkTitle}>{framework.name}</Text>
              </View>
              <View style={styles.frameworkBody}>
                <View style={styles.tableHeader}>
                  <Text style={styles.controlId}>Control</Text>
                  <Text style={styles.controlName}>Name</Text>
                  <Text style={styles.controlStatus}>Status</Text>
                  <Text style={styles.controlFindings}>Findings</Text>
                </View>
                {framework.controls.map((control) => {
                  const findings = findingsByControl.get(control.id) || [];
                  const hasCritical = findings.some((f) => f.severity === 'critical');
                  const hasHigh = findings.some((f) => f.severity === 'high');
                  const status =
                    findings.length === 0
                      ? 'Passed'
                      : hasCritical
                        ? 'Critical'
                        : hasHigh
                          ? 'At Risk'
                          : 'Needs Review';
                  const statusColor =
                    findings.length === 0
                      ? '#10B981'
                      : hasCritical
                        ? '#DC2626'
                        : hasHigh
                          ? '#EA580C'
                          : '#CA8A04';

                  return (
                    <View key={control.id} style={styles.controlRow}>
                      <Text style={styles.controlId}>{control.id}</Text>
                      <Text style={styles.controlName}>{control.name}</Text>
                      <View style={styles.controlStatus}>
                        <Text
                          style={[
                            styles.statusBadge,
                            { backgroundColor: `${statusColor}20`, color: statusColor },
                          ]}
                        >
                          {status}
                        </Text>
                      </View>
                      <Text style={styles.controlFindings}>{findings.length}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Findings by Control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Findings by Control</Text>
          {Array.from(findingsByControl.entries()).map(([controlId, findings]) => (
            <View key={controlId} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 6 }}>
                {controlId}:{' '}
                {FRAMEWORK_PLACEHOLDERS['owasp-top-10-2021'].controls.find(
                  (c) => c.id === controlId
                )?.name || 'Unknown Control'}
              </Text>
              {findings.slice(0, 3).map((finding) => (
                <View
                  key={finding.id}
                  style={[
                    styles.findingMapping,
                    {
                      borderLeftColor:
                        SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS] ||
                        '#6B7280',
                    },
                  ]}
                >
                  <Text style={styles.mappingTitle}>
                    [{finding.severity.toUpperCase()}] {finding.title}
                  </Text>
                  <Text style={styles.mappingControls} numberOfLines={2}>
                    {finding.description}
                  </Text>
                </View>
              ))}
              {findings.length > 3 && (
                <Text style={{ fontSize: 8, color: '#6B7280', marginLeft: 10 }}>
                  + {findings.length - 3} more findings
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text>
            Disclaimer: This compliance mapping is based on automated analysis and should be
            reviewed by qualified security professionals. Compliance status may change based on
            additional context or manual review.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Shannon Compliance Assessment</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
