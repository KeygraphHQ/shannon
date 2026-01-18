/**
 * Executive Report PDF Template.
 * High-level summary for executives and stakeholders.
 * Focus: Risk score, summary metrics, key findings, business impact.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ReportData } from './types';
import { SEVERITY_COLORS } from './types';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1F2937',
  },
  header: {
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: '#3B82F6',
    paddingBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 5,
  },
  riskScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  riskScoreBox: {
    width: 80,
    height: 80,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  riskScoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  riskScoreLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    marginTop: 2,
  },
  riskDescription: {
    flex: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  summaryItem: {
    width: '20%',
    padding: 10,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  summaryLabel: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 4,
  },
  findingCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  findingTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  findingDescription: {
    fontSize: 9,
    color: '#4B5563',
    lineHeight: 1.4,
  },
  severityBadge: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    color: '#FFFFFF',
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#9CA3AF',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  executiveSummary: {
    fontSize: 10,
    lineHeight: 1.6,
    color: '#374151',
  },
  metadata: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 15,
  },
});

function getRiskScoreColor(score: number): string {
  if (score >= 80) return '#DC2626'; // Critical - red
  if (score >= 60) return '#EA580C'; // High - orange
  if (score >= 40) return '#CA8A04'; // Medium - yellow
  if (score >= 20) return '#2563EB'; // Low - blue
  return '#10B981'; // Minimal - green
}

function getRiskLevel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  if (score >= 20) return 'Low';
  return 'Minimal';
}

export function ExecutiveReport({ data }: { data: ReportData }) {
  const topFindings = data.findings
    .filter((f) => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 5);

  const riskColor = getRiskScoreColor(data.summary.riskScore);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{data.metadata.title}</Text>
          <Text style={styles.subtitle}>
            {data.project.name} • {data.project.targetUrl}
          </Text>
        </View>

        {/* Metadata */}
        <View style={styles.metadata}>
          <Text>
            Generated: {data.metadata.generatedAt.toLocaleDateString()} • Organization:{' '}
            {data.organization.name}
          </Text>
        </View>

        {/* Risk Score */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overall Risk Assessment</Text>
          <View style={styles.riskScoreContainer}>
            <View style={[styles.riskScoreBox, { backgroundColor: riskColor }]}>
              <Text style={styles.riskScoreValue}>{data.summary.riskScore}</Text>
              <Text style={styles.riskScoreLabel}>Risk Score</Text>
            </View>
            <View style={styles.riskDescription}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>
                {getRiskLevel(data.summary.riskScore)} Risk
              </Text>
              <Text style={{ fontSize: 10, color: '#4B5563', lineHeight: 1.4 }}>
                Based on {data.summary.total} findings identified during the security assessment.
                {data.summary.critical > 0 &&
                  ` ${data.summary.critical} critical vulnerabilities require immediate attention.`}
              </Text>
            </View>
          </View>
        </View>

        {/* Summary Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Findings Summary</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: SEVERITY_COLORS.critical }]}>
                {data.summary.critical}
              </Text>
              <Text style={styles.summaryLabel}>Critical</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: SEVERITY_COLORS.high }]}>
                {data.summary.high}
              </Text>
              <Text style={styles.summaryLabel}>High</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: SEVERITY_COLORS.medium }]}>
                {data.summary.medium}
              </Text>
              <Text style={styles.summaryLabel}>Medium</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: SEVERITY_COLORS.low }]}>
                {data.summary.low}
              </Text>
              <Text style={styles.summaryLabel}>Low</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: '#111827' }]}>{data.summary.total}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
          </View>
        </View>

        {/* Executive Summary */}
        {data.scan.result?.executiveSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <Text style={styles.executiveSummary}>{data.scan.result.executiveSummary}</Text>
          </View>
        )}

        {/* Top Findings */}
        {topFindings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Critical & High Priority Findings</Text>
            {topFindings.map((finding) => (
              <View
                key={finding.id}
                style={[
                  styles.findingCard,
                  {
                    borderLeftColor:
                      SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS] ||
                      '#6B7280',
                  },
                ]}
              >
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
                <Text style={styles.findingTitle}>{finding.title}</Text>
                <Text style={styles.findingDescription} numberOfLines={3}>
                  {finding.description}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Shannon Security Assessment</Text>
          <Text>Report ID: {data.metadata.reportId}</Text>
        </View>
      </Page>
    </Document>
  );
}
