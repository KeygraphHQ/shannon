/**
 * Technical Report PDF Template.
 * Detailed technical findings for security teams.
 * Focus: Full finding details, evidence, remediation steps, CWE/CVSS.
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
    borderBottomColor: '#10B981',
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
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    padding: 8,
    fontWeight: 'bold',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    padding: 6,
    fontSize: 8,
  },
  colSeverity: { width: '12%' },
  colTitle: { width: '30%' },
  colCategory: { width: '15%' },
  colCwe: { width: '12%' },
  colCvss: { width: '10%' },
  colStatus: { width: '12%' },
  findingDetail: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  findingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  findingTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    flex: 1,
  },
  findingBody: {
    padding: 10,
  },
  label: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#6B7280',
    marginBottom: 2,
    marginTop: 8,
  },
  value: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#374151',
  },
  severityBadge: {
    fontSize: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
    color: '#FFFFFF',
  },
  evidenceBox: {
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 2,
    marginTop: 4,
    fontFamily: 'Courier',
    fontSize: 8,
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  metadataItem: {
    width: '25%',
    marginBottom: 8,
  },
  metadataLabel: {
    fontSize: 7,
    color: '#6B7280',
  },
  metadataValue: {
    fontSize: 9,
    fontWeight: 'bold',
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
  pageNumber: {
    fontSize: 8,
    color: '#6B7280',
  },
  tocItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  tocTitle: {
    flex: 1,
  },
  tocPage: {
    width: 30,
    textAlign: 'right',
  },
});

function formatEvidence(evidence: unknown): string {
  if (!evidence) return 'No evidence provided';
  if (typeof evidence === 'string') return evidence;
  try {
    return JSON.stringify(evidence, null, 2);
  } catch {
    return String(evidence);
  }
}

export function TechnicalReport({ data }: { data: ReportData }) {
  // Group findings by severity for organized presentation
  const findingsBySeverity = {
    critical: data.findings.filter((f) => f.severity === 'critical'),
    high: data.findings.filter((f) => f.severity === 'high'),
    medium: data.findings.filter((f) => f.severity === 'medium'),
    low: data.findings.filter((f) => f.severity === 'low'),
    info: data.findings.filter((f) => f.severity === 'info'),
  };

  return (
    <Document>
      {/* Title Page */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{data.metadata.title}</Text>
          <Text style={styles.subtitle}>Technical Security Assessment Report</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assessment Details</Text>
          <View style={styles.metadataGrid}>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Target</Text>
              <Text style={styles.metadataValue}>{data.project.name}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>URL</Text>
              <Text style={styles.metadataValue}>{data.project.targetUrl}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Organization</Text>
              <Text style={styles.metadataValue}>{data.organization.name}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Generated</Text>
              <Text style={styles.metadataValue}>
                {data.metadata.generatedAt.toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Total Findings</Text>
              <Text style={styles.metadataValue}>{data.summary.total}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Risk Score</Text>
              <Text style={styles.metadataValue}>{data.summary.riskScore}/100</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Scan Duration</Text>
              <Text style={styles.metadataValue}>
                {data.scan.durationMs ? `${Math.round(data.scan.durationMs / 1000)}s` : 'N/A'}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Report ID</Text>
              <Text style={styles.metadataValue}>{data.metadata.reportId.slice(0, 8)}...</Text>
            </View>
          </View>
        </View>

        {/* Findings Summary Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Findings Summary</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colSeverity}>Severity</Text>
            <Text style={styles.colTitle}>Finding</Text>
            <Text style={styles.colCategory}>Category</Text>
            <Text style={styles.colCwe}>CWE</Text>
            <Text style={styles.colCvss}>CVSS</Text>
            <Text style={styles.colStatus}>Status</Text>
          </View>
          {data.findings.slice(0, 20).map((finding) => (
            <View key={finding.id} style={styles.tableRow}>
              <Text
                style={[
                  styles.colSeverity,
                  {
                    color:
                      SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS] ||
                      '#6B7280',
                    fontWeight: 'bold',
                  },
                ]}
              >
                {finding.severity.toUpperCase()}
              </Text>
              <Text style={styles.colTitle} numberOfLines={2}>
                {finding.title}
              </Text>
              <Text style={styles.colCategory}>{finding.category}</Text>
              <Text style={styles.colCwe}>{finding.cwe || '-'}</Text>
              <Text style={styles.colCvss}>{finding.cvss?.toFixed(1) || '-'}</Text>
              <Text style={styles.colStatus}>{finding.status}</Text>
            </View>
          ))}
          {data.findings.length > 20 && (
            <Text style={{ fontSize: 8, color: '#6B7280', padding: 6, fontStyle: 'italic' }}>
              ... and {data.findings.length - 20} more findings (see detailed pages)
            </Text>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>Shannon Technical Assessment</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* Detailed Findings Pages */}
      {Object.entries(findingsBySeverity).map(([severity, findings]) =>
        findings.length > 0 ? (
          <Page key={severity} size="A4" style={styles.page}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {severity.charAt(0).toUpperCase() + severity.slice(1)} Severity Findings (
                {findings.length})
              </Text>

              {findings.map((finding) => (
                <View key={finding.id} style={styles.findingDetail} wrap={false}>
                  <View
                    style={[
                      styles.findingHeader,
                      {
                        backgroundColor:
                          `${SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS]}15` ||
                          '#F9FAFB',
                      },
                    ]}
                  >
                    <Text style={styles.findingTitle}>{finding.title}</Text>
                    <Text
                      style={[
                        styles.severityBadge,
                        {
                          backgroundColor:
                            SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS] ||
                            '#6B7280',
                        },
                      ]}
                    >
                      {finding.severity.toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.findingBody}>
                    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                      <View style={{ width: '25%' }}>
                        <Text style={styles.label}>Category</Text>
                        <Text style={styles.value}>{finding.category}</Text>
                      </View>
                      <View style={{ width: '25%' }}>
                        <Text style={styles.label}>CWE</Text>
                        <Text style={styles.value}>{finding.cwe || 'N/A'}</Text>
                      </View>
                      <View style={{ width: '25%' }}>
                        <Text style={styles.label}>CVSS</Text>
                        <Text style={styles.value}>{finding.cvss?.toFixed(1) || 'N/A'}</Text>
                      </View>
                      <View style={{ width: '25%' }}>
                        <Text style={styles.label}>Status</Text>
                        <Text style={styles.value}>{finding.status}</Text>
                      </View>
                    </View>

                    <Text style={styles.label}>Description</Text>
                    <Text style={styles.value}>{finding.description}</Text>

                    {finding.evidence && (
                      <>
                        <Text style={styles.label}>Evidence</Text>
                        <View style={styles.evidenceBox}>
                          <Text>{formatEvidence(finding.evidence)}</Text>
                        </View>
                      </>
                    )}

                    {finding.remediation && (
                      <>
                        <Text style={styles.label}>Remediation</Text>
                        <Text style={styles.value}>{finding.remediation}</Text>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.footer} fixed>
              <Text>Shannon Technical Assessment</Text>
              <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
            </View>
          </Page>
        ) : null
      )}
    </Document>
  );
}
