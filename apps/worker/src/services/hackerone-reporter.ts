import fs from 'node:fs/promises';
import path from 'node:path';
import type { ScopeViolation } from './scope-validator.js';

export async function generateHackerOneReports(
  workspaceDir: string,
  findings: Record<string, any>[],
  bountyConfig: Record<string, any>, 
  violations: ScopeViolation[]
): Promise<void> {
  const h1Dir = path.join(workspaceDir, 'hackerone');
  await fs.mkdir(h1Dir, { recursive: true });

  let count = 1;
  for (const finding of findings) {
    // Basic markdown generation stub
    const markdown = `
# ${finding.title || 'Vulnerability'}

**Description**
${finding.description || 'Details go here.'}

**Impact**
[SUGGESTED CVSS — review before submitting]
${finding.impact || '...'}

**Proof of Concept**
${finding.poc || '...'}
    `.trim();

    const slug = (finding.title || 'vuln').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `finding-${String(count).padStart(3, '0')}-${slug}.md`;
    await fs.writeFile(path.join(h1Dir, filename), markdown, 'utf-8');
    count++;
  }
}
