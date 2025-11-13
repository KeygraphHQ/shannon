// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { fs, path } from 'zx';
import chalk from 'chalk';
import { PentestError } from '../error-handling.js';

// Pure function: Assemble final report from specialist deliverables
export async function assembleFinalReport(sourceDir) {
  const deliverableFiles = [
    { name: 'Injection', path: 'injection_exploitation_evidence.md', required: false },
    { name: 'XSS', path: 'xss_exploitation_evidence.md', required: false },
    { name: 'Authentication', path: 'auth_exploitation_evidence.md', required: false },
    { name: 'SSRF', path: 'ssrf_exploitation_evidence.md', required: false },
    { name: 'Authorization', path: 'authz_exploitation_evidence.md', required: false }
  ];

  const sections = [];

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
      console.log(chalk.yellow(`⚠️ Could not read ${file.path}: ${error.message}`));
    }
  }

  const finalContent = sections.join('\n\n');
  const finalReportPath = path.join(sourceDir, 'deliverables', 'comprehensive_security_assessment_report.md');

  try {
    await fs.writeFile(finalReportPath, finalContent);
    console.log(chalk.green(`✅ Final report assembled at ${finalReportPath}`));
  } catch (error) {
    throw new PentestError(
      `Failed to write final report: ${error.message}`,
      'filesystem',
      false,
      { finalReportPath, originalError: error.message }
    );
  }

  return finalContent;
}