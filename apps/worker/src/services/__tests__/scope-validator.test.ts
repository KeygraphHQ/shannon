import { describe, it, expect } from "vitest";
import { ScopeValidator, AuditLogEntry, BountyConfig } from "../scope-validator";

describe("ScopeValidator Suite", () => {
  const sampleConfig: BountyConfig = {
    in_scope_domains: ["shopify.com", "*.shopify.com", "hackerone.com"],
    out_of_scope_patterns: ["secret.shopify.com", "*.dev.shopify.com"],
  };

  it("should pass clean logs", () => {
    const cleanLog: AuditLogEntry[] = [
      { url: "https://shopify.com/login", agent: "auth-vuln", timestamp: 1717393200 },
      { url: "admin.shopify.com/dashboard", agent: "recon", timestamp: 1717393205 },
      { url: "https://hackerone.com/monitors", agent: "cors-vuln", timestamp: 1717393210 },
    ];

    const violations = ScopeValidator.validate(cleanLog, sampleConfig);
    expect(violations).toHaveLength(0);
  });

  it("should ignore paths", () => {
    const logWithPaths: AuditLogEntry[] = [
      { url: "https://shopify.com/path#test", agent: "recon", timestamp: 1717393200 }
    ];

    const violations = ScopeValidator.validate(logWithPaths, sampleConfig);
    expect(violations).toHaveLength(0);
  });

  it("should flag explicit out of scope", () => {
    const maliciousLog: AuditLogEntry[] = [
      { url: "https://secret.shopify.com/api", agent: "info-disclosure-vuln", timestamp: 1717393220 },
      { url: "https://staging.dev.shopify.com/metrics", agent: "open-redirects-vuln", timestamp: 1717393225 },
    ];

    const violations = ScopeValidator.validate(maliciousLog, sampleConfig);
    expect(violations).toHaveLength(2);
  });

  it("should catch external domains", () => {
    const externalLog: AuditLogEntry[] = [
      { url: "https://unauthorized-target.com/exploit", agent: "auth-vuln", timestamp: 1717393250 }
    ];

    const violations = ScopeValidator.validate(externalLog, sampleConfig);
    expect(violations).toHaveLength(1);
  });
});
