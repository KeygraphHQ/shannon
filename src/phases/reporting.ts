// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import chalk from 'chalk';
import { PentestError } from '../error-handling.js';

interface DeliverableFile {
  name: string;
  path: string;
  required: boolean;
}

// Pure function: Assemble final report from specialist deliverables
export async function assembleFinalReport(sourceDir: string): Promise<string> {
  const deliverableFiles: DeliverableFile[] = [
    { name: 'Injection', path: 'injection_exploitation_evidence.md', required: false },
    { name: 'XSS', path: 'xss_exploitation_evidence.md', required: false },
    { name: 'Authentication', path: 'auth_exploitation_evidence.md', required: false },
    { name: 'SSRF', path: 'ssrf_exploitation_evidence.md', required: false },
    { name: 'Authorization', path: 'authz_exploitation_evidence.md', required: false }
  ];

  const sections: string[] = [];

  for (const file of deliverableFiles) {
    const filePath = path.join(sourceDir, 'deliverables', file.path);
    try {
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf8');
        sections.push(content);
        console.log(chalk.green(`✅ Added ${file.name} findings`));
      } else if (file.required) {
        throw new Error(`Required file ${file.path} not found`);
      } else {
        console.log(chalk.gray(`⏭️  No ${file.name} deliverable found`));
      }
    } catch (error) {
      if (file.required) {
        throw error;
      }
      const err = error as Error;
      console.log(chalk.yellow(`⚠️ Could not read ${file.path}: ${err.message}`));
    }
  }

  const finalContent = sections.join('\n\n');
  const finalReportPath = path.join(sourceDir, 'deliverables', 'comprehensive_security_assessment_report.md');

  try {
    await fs.writeFile(finalReportPath, finalContent);
    console.log(chalk.green(`✅ Final report assembled at ${finalReportPath}`));
  } catch (error) {
    const err = error as Error;
    throw new PentestError(
      `Failed to write final report: ${err.message}`,
      'filesystem',
      false,
      { finalReportPath, originalError: err.message }
    );
  }

  return finalContent;
}
