export interface ScopeViolation {
  url: string;
  agent: string;
  timestamp: string;
}

export class ScopeValidator {
  constructor(
    private inScopeDomains: string[],
    private outOfScopePatterns: string[]
  ) {}

  private extractHostname(urlStr: string): string | null {
    try {
      const url = new URL(urlStr);
      return url.hostname;
    } catch {
      return null;
    }
  }

  private matchPattern(hostname: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
    }
    return hostname === pattern;
  }

  public validateUrl(urlStr: string): boolean {
    const hostname = this.extractHostname(urlStr);
    if (!hostname) return false;

    // Check out of scope first
    for (const pattern of this.outOfScopePatterns) {
      if (this.matchPattern(hostname, pattern)) {
        return false;
      }
    }

    // Check in scope
    for (const pattern of this.inScopeDomains) {
      if (this.matchPattern(hostname, pattern)) {
        return true;
      }
    }

    return false;
  }
}
