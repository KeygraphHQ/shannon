/**
 * SARIF (Static Analysis Results Interchange Format) Exporter
 * Converts scan findings to SARIF v2.1.0 format for GitHub Code Scanning compatibility
 */

import { Scan, ScanResult, Project } from "@prisma/client";

export interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note" | "none";
  message: { text: string };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri: string };
      region?: { startLine?: number; endLine?: number };
    };
  }>;
  properties?: Record<string, unknown>;
}

export interface SarifReport {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules?: Array<{
          id: string;
          name: string;
          shortDescription: { text: string };
          fullDescription?: { text: string };
          defaultConfiguration?: { level: string };
          properties?: Record<string, unknown>;
        }>;
      };
    };
    results: SarifResult[];
    invocations?: Array<{
      executionSuccessful: boolean;
      startTimeUtc?: string;
      endTimeUtc?: string;
    }>;
  }>;
}

export interface ScanExportData {
  scan: Scan & {
    project: Pick<Project, "id" | "name" | "targetUrl" | "repositoryUrl">;
    result: ScanResult | null;
  };
  findings?: Array<{
    id: string;
    type: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
    title: string;
    description: string;
    location?: string;
    line?: number;
    cweId?: string;
    remediation?: string;
  }>;
}

// Map severity levels to SARIF levels
const severityToSarifLevel: Record<string, "error" | "warning" | "note" | "none"> = {
  CRITICAL: "error",
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "note",
  INFO: "none",
};

// Common vulnerability rules (CWE-based)
const commonRules: Record<string, { name: string; description: string; cweId?: string }> = {
  "sql-injection": {
    name: "SQL Injection",
    description: "SQL injection vulnerability allows attackers to execute arbitrary SQL commands",
    cweId: "CWE-89",
  },
  "xss": {
    name: "Cross-Site Scripting (XSS)",
    description: "XSS vulnerability allows attackers to inject malicious scripts",
    cweId: "CWE-79",
  },
  "command-injection": {
    name: "Command Injection",
    description: "Command injection vulnerability allows execution of arbitrary system commands",
    cweId: "CWE-78",
  },
  "ssrf": {
    name: "Server-Side Request Forgery (SSRF)",
    description: "SSRF vulnerability allows attackers to make requests from the server",
    cweId: "CWE-918",
  },
  "auth-bypass": {
    name: "Authentication Bypass",
    description: "Authentication bypass allows unauthorized access to protected resources",
    cweId: "CWE-287",
  },
  "idor": {
    name: "Insecure Direct Object Reference (IDOR)",
    description: "IDOR allows unauthorized access to objects by manipulating references",
    cweId: "CWE-639",
  },
  "path-traversal": {
    name: "Path Traversal",
    description: "Path traversal allows access to files outside the intended directory",
    cweId: "CWE-22",
  },
  "csrf": {
    name: "Cross-Site Request Forgery (CSRF)",
    description: "CSRF allows attackers to perform actions on behalf of authenticated users",
    cweId: "CWE-352",
  },
  "open-redirect": {
    name: "Open Redirect",
    description: "Open redirect vulnerability allows redirecting users to malicious sites",
    cweId: "CWE-601",
  },
  "sensitive-data-exposure": {
    name: "Sensitive Data Exposure",
    description: "Sensitive data is exposed without proper protection",
    cweId: "CWE-200",
  },
};

/**
 * Converts a vulnerability type to a rule ID
 */
function typeToRuleId(type: string): string {
  return type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generates a SARIF v2.1.0 report from scan data
 */
export function generateSarif(data: ScanExportData): SarifReport {
  const { scan, findings = [] } = data;

  // Build rules from findings
  const rulesMap = new Map<string, typeof commonRules[string] & { id: string }>();
  const results: SarifResult[] = [];

  // If we have actual findings, process them
  if (findings.length > 0) {
    for (const finding of findings) {
      const ruleId = typeToRuleId(finding.type);
      const knownRule = commonRules[ruleId];

      // Add rule if not already added
      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          id: ruleId,
          name: knownRule?.name || finding.type,
          description: knownRule?.description || finding.description,
          cweId: finding.cweId || knownRule?.cweId,
        });
      }

      // Add result
      const result: SarifResult = {
        ruleId,
        level: severityToSarifLevel[finding.severity] || "warning",
        message: { text: finding.description },
        properties: {
          severity: finding.severity,
          title: finding.title,
          ...(finding.remediation && { remediation: finding.remediation }),
        },
      };

      // Add location if available
      if (finding.location) {
        result.locations = [
          {
            physicalLocation: {
              artifactLocation: { uri: finding.location },
              ...(finding.line && { region: { startLine: finding.line } }),
            },
          },
        ];
      }

      results.push(result);
    }
  } else {
    // Generate summary results from scan counts if no detailed findings
    const addSummaryResults = (severity: string, count: number, ruleId: string) => {
      if (count > 0) {
        const knownRule = commonRules[ruleId] || {
          name: `${severity} Severity Finding`,
          description: `${count} ${severity.toLowerCase()} severity finding(s) detected`,
        };

        if (!rulesMap.has(ruleId)) {
          rulesMap.set(ruleId, { id: ruleId, ...knownRule });
        }

        results.push({
          ruleId,
          level: severityToSarifLevel[severity] || "warning",
          message: {
            text: `${count} ${severity.toLowerCase()} severity finding(s) detected in ${scan.project.targetUrl}`,
          },
          properties: {
            severity,
            count,
            targetUrl: scan.project.targetUrl,
          },
        });
      }
    };

    addSummaryResults("CRITICAL", scan.criticalCount, "critical-findings");
    addSummaryResults("HIGH", scan.highCount, "high-findings");
    addSummaryResults("MEDIUM", scan.mediumCount, "medium-findings");
    addSummaryResults("LOW", scan.lowCount, "low-findings");
  }

  // Build SARIF report
  const sarif: SarifReport = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Shannon",
            version: "1.0.0",
            informationUri: "https://shannon.security",
            rules: Array.from(rulesMap.values()).map((rule) => ({
              id: rule.id,
              name: rule.name,
              shortDescription: { text: rule.description },
              ...(rule.cweId && {
                properties: {
                  tags: [rule.cweId],
                  "security-severity": rule.id.includes("critical")
                    ? "9.0"
                    : rule.id.includes("high")
                      ? "7.0"
                      : rule.id.includes("medium")
                        ? "5.0"
                        : "3.0",
                },
              }),
            })),
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: scan.status === "COMPLETED",
            ...(scan.startedAt && { startTimeUtc: new Date(scan.startedAt).toISOString() }),
            ...(scan.completedAt && { endTimeUtc: new Date(scan.completedAt).toISOString() }),
          },
        ],
      },
    ],
  };

  return sarif;
}

/**
 * Converts SARIF report to JSON string
 */
export function sarifToJson(data: ScanExportData): string {
  const sarif = generateSarif(data);
  return JSON.stringify(sarif, null, 2);
}
