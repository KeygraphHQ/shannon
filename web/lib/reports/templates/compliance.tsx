/**
 * Compliance Report PDF Template.
 * Compliance-focused view for auditors.
 * Focus: Framework mappings, control coverage, compliance gaps.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ReportData } from './types';
import { SEVERITY_COLORS } from './types';
import {
  getFramework,
  mapFindingToControls,
  DEFAULT_FRAMEWORK_ID,
  type ComplianceFramework,
} from '@/lib/compliance';

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
  frameworkSubtitle: {
    fontSize: 9,
    color: '#E9D5FF',
    marginTop: 2,
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
  categoryHeader: {
    backgroundColor: '#F3F4F6',
    padding: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#374151',
  },
});

interface ControlWithFindings {
  categoryId: string;
  categoryName: string;
  controlId: string;
  controlName: string;
  findings: typeof ReportData.prototype.findings;
}

export function ComplianceReport({ data }: { data: ReportData }) {
  // Get frameworks to report on
  const frameworkIds = data.metadata.frameworkIds?.length
    ? data.metadata.frameworkIds
    : [DEFAULT_FRAMEWORK_ID];

  // Map findings to controls using the compliance library
  const controlMappings = new Map<string, Map<string, ControlWithFindings>>();

  // Initialize control mappings for each framework
  frameworkIds.forEach((frameworkId) => {
    const framework = getFramework(frameworkId);
    if (framework) {
      const frameworkControls = new Map<string, ControlWithFindings>();
      framework.categories.forEach((category) => {
        category.controls.forEach((control) => {
          frameworkControls.set(control.id, {
            categoryId: category.id,
            categoryName: category.name,
            controlId: control.id,
            controlName: control.name,
            findings: [],
          });
        });
      });
      controlMappings.set(frameworkId, frameworkControls);
    }
  });

  // Map findings to controls
  data.findings.forEach((finding) => {
    const mappings = mapFindingToControls(
      { cwe: finding.cwe || null, category: finding.category },
      frameworkIds
    );

    mappings.forEach((mapping) => {
      const frameworkControls = controlMappings.get(mapping.frameworkId);
      if (frameworkControls) {
        const control = frameworkControls.get(mapping.controlId);
        if (control) {
          control.findings.push(finding);
        }
      }
    });
  });

  // Calculate metrics for each framework
  const frameworkMetrics = frameworkIds.map((frameworkId) => {
    const framework = getFramework(frameworkId);
    const frameworkControls = controlMappings.get(frameworkId);

    if (!framework || !frameworkControls) {
      return null;
    }

    let totalControls = 0;
    let controlsWithFindings = 0;
    let totalFindingsInControls = 0;

    frameworkControls.forEach((control) => {
      totalControls++;
      if (control.findings.length > 0) {
        controlsWithFindings++;
        totalFindingsInControls += control.findings.length;
      }
    });

    const passedControls = totalControls - controlsWithFindings;
    const compliancePercentage =
      totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : 100;

    return {
      frameworkId,
      framework,
      frameworkControls,
      totalControls,
      controlsWithFindings,
      passedControls,
      compliancePercentage,
      totalFindingsInControls,
    };
  }).filter((m): m is NonNullable<typeof m> => m !== null);

  // Get overall metrics
  const overallMetrics = {
    totalControls: frameworkMetrics.reduce((sum, m) => sum + m.totalControls, 0),
    passedControls: frameworkMetrics.reduce((sum, m) => sum + m.passedControls, 0),
    controlsWithFindings: frameworkMetrics.reduce((sum, m) => sum + m.controlsWithFindings, 0),
    compliancePercentage:
      frameworkMetrics.length > 0
        ? Math.round(
            frameworkMetrics.reduce((sum, m) => sum + m.compliancePercentage, 0) /
              frameworkMetrics.length
          )
        : 100,
  };

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
              <Text style={[styles.scoreValue, { color: '#10B981' }]}>
                {overallMetrics.compliancePercentage}%
              </Text>
              <Text style={styles.scoreLabel}>Compliance Score</Text>
            </View>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreValue, { color: '#10B981' }]}>
                {overallMetrics.passedControls}
              </Text>
              <Text style={styles.scoreLabel}>Controls Passed</Text>
            </View>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreValue, { color: '#DC2626' }]}>
                {overallMetrics.controlsWithFindings}
              </Text>
              <Text style={styles.scoreLabel}>Controls with Issues</Text>
            </View>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreValue, { color: '#111827' }]}>{data.summary.total}</Text>
              <Text style={styles.scoreLabel}>Total Findings</Text>
            </View>
          </View>
        </View>

        {/* Framework Control Status */}
        {frameworkMetrics.map(({ frameworkId, framework, frameworkControls }) => (
          <View key={frameworkId} style={styles.frameworkCard}>
            <View style={styles.frameworkHeader}>
              <Text style={styles.frameworkTitle}>{framework.name}</Text>
              <Text style={styles.frameworkSubtitle}>Version {framework.version}</Text>
            </View>
            <View style={styles.frameworkBody}>
              <View style={styles.tableHeader}>
                <Text style={styles.controlId}>Control</Text>
                <Text style={styles.controlName}>Name</Text>
                <Text style={styles.controlStatus}>Status</Text>
                <Text style={styles.controlFindings}>Findings</Text>
              </View>

              {/* Group controls by category */}
              {framework.categories.map((category) => {
                const categoryControls = category.controls
                  .map((c) => frameworkControls.get(c.id))
                  .filter((c): c is ControlWithFindings => c !== undefined);

                if (categoryControls.length === 0) return null;

                return (
                  <View key={category.id}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryTitle}>
                        {category.id}: {category.name}
                      </Text>
                    </View>
                    {categoryControls.map((control) => {
                      const findings = control.findings;
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
                        <View key={control.controlId} style={styles.controlRow}>
                          <Text style={styles.controlId}>{control.controlId}</Text>
                          <Text style={styles.controlName}>{control.controlName}</Text>
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
                );
              })}
            </View>
          </View>
        ))}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text>
            Disclaimer: This compliance mapping is based on automated analysis using CWE mappings
            and category correlation. It should be reviewed by qualified security professionals.
            Compliance status may change based on additional context or manual review.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Shannon Compliance Assessment</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* Page 2: Findings by Control */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Findings by Control</Text>
          <Text style={styles.subtitle}>Detailed mapping of findings to framework controls</Text>
        </View>

        {frameworkMetrics.map(({ frameworkId, framework, frameworkControls }) => {
          // Get controls that have findings
          const controlsWithFindings = Array.from(frameworkControls.values()).filter(
            (c) => c.findings.length > 0
          );

          if (controlsWithFindings.length === 0) {
            return (
              <View key={frameworkId} style={styles.section}>
                <Text style={styles.sectionTitle}>{framework.name}</Text>
                <Text style={{ fontSize: 9, color: '#6B7280', marginTop: 8 }}>
                  No findings mapped to controls in this framework.
                </Text>
              </View>
            );
          }

          return (
            <View key={frameworkId} style={styles.section}>
              <Text style={styles.sectionTitle}>{framework.name}</Text>
              {controlsWithFindings.map((control) => (
                <View key={control.controlId} style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 6 }}>
                    {control.controlId}: {control.controlName}
                  </Text>
                  <Text style={{ fontSize: 8, color: '#6B7280', marginBottom: 4 }}>
                    Category: {control.categoryId} - {control.categoryName}
                  </Text>
                  {control.findings.slice(0, 3).map((finding) => (
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
                      {finding.cwe && (
                        <Text
                          style={{ fontSize: 7, color: '#9CA3AF', marginTop: 2 }}
                        >
                          {finding.cwe}
                        </Text>
                      )}
                    </View>
                  ))}
                  {control.findings.length > 3 && (
                    <Text style={{ fontSize: 8, color: '#6B7280', marginLeft: 10 }}>
                      + {control.findings.length - 3} more findings
                    </Text>
                  )}
                </View>
              ))}
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Shannon Compliance Assessment</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
