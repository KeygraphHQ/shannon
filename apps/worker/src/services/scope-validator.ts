// apps/worker/src/services/scope-validator.ts

export interface ScopeViolation {
  url: string;
  agent: string;
  timestamp: number;
}

export interface AuditLogEntry {
  url: string;
  agent: string;
  timestamp: number;
}

export interface BountyConfig {
  in_scope_domains: string[];
  out_of_scope_patterns: string[];
}

export class ScopeValidator {
  /**
   * Evaluates entire worker audit logs against the target program 
configuration
   * to ensure no out-of-scope traversal occurred during the pipeline run.
   */
  public static validate(
    auditLog: AuditLogEntry[],
    bountyConfig: BountyConfig
  ): ScopeViolation[] {
    const violations: ScopeViolation[] = [];

    for (const entry of auditLog) {
      const hostname = this.extractHostname(entry.url);
      if (!hostname) continue;

      // Rule 1: Must exist inside explicit or wildcard in-scope domains
      const isInScope = bountyConfig.in_scope_domains.some((domain) =>
        this.matchDomain(hostname, domain)
      );

      // Rule 2: Must not match any explicit out-of-scope exclusions
      const isExplicitlyExcluded = 
bountyConfig.out_of_scope_patterns.some((pattern) =>
        this.matchDomain(hostname, pattern)
      );

      if (!isInScope || isExplicitlyExcluded) {
        violations.push({
          url: entry.url,
          agent: entry.agent,
          timestamp: entry.timestamp,
        });
      }
    }

    return violations;
  }

  /**
   * Normalizes inbound execution targets to hostnames only,
   * stripping out path parameters, query strings, and fragments.
   */
  private static extractHostname(urlStr: string): string | null {
    try {
      const targetUrl = urlStr.includes("://") ? urlStr : 
`https://${urlStr}`;
      const parsed = new URL(targetUrl);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Performs granular wildcard and exact-match checking against target 
constraints.
   * Compares right-to-left to ensure third-party domains can't spoof 
subdomains.
   */
  private static matchDomain(hostname: string, pattern: string): boolean {
    const normalizedPattern = pattern.trim().toLowerCase();
    
    if (hostname === normalizedPattern) {
      return true;
    }

    if (normalizedPattern.startsWith("*.")) {
      const baseDomain = normalizedPattern.slice(2);
      return hostname === baseDomain || 
hostname.endsWith(`.${baseDomain}`);
    }

    return false;
  }
}
