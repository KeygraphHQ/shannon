/**
 * `shannon logs` command — tail a workspace's workflow log.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getWorkspacesDir } from '../home.js';

export function logs(workspaceId: string): void {
  const workspacesDir = getWorkspacesDir();
  let logFile = '';

  // 1. Direct match
  const directPath = path.join(workspacesDir, workspaceId, 'workflow.log');
  if (fs.existsSync(directPath)) {
    logFile = directPath;
  }

  // 2. Resume workflow ID (e.g. workspace_resume_123)
  if (!logFile) {
    const base = workspaceId.replace(/_resume_\d+$/, '');
    if (base !== workspaceId) {
      const resumePath = path.join(workspacesDir, base, 'workflow.log');
      if (fs.existsSync(resumePath)) {
        logFile = resumePath;
      }
    }
  }

  // 3. Named workspace ID (e.g. workspace_shannon-123)
  if (!logFile) {
    const base = workspaceId.replace(/_shannon-\d+$/, '');
    if (base !== workspaceId) {
      const namedPath = path.join(workspacesDir, base, 'workflow.log');
      if (fs.existsSync(namedPath)) {
        logFile = namedPath;
      }
    }
  }

  if (!logFile) {
    console.error(`ERROR: Workflow log not found for: ${workspaceId}`);
    console.error('');
    console.error('Possible causes:');
    console.error('  - Workflow hasn\'t started yet');
    console.error('  - Workspace ID is incorrect');
    console.error('');
    console.error('Check the Temporal Web UI at http://localhost:8233 for workflow details');
    process.exit(1);
  }

  console.log(`Tailing workflow log: ${logFile}`);

  // Stream existing content, then watch for new lines
  const stream = fs.createReadStream(logFile, { encoding: 'utf-8' });
  stream.pipe(process.stdout);

  stream.on('end', () => {
    // Switch to watching for appended content
    let position = fs.statSync(logFile).size;
    const watcher = fs.watch(logFile, () => {
      const stat = fs.statSync(logFile);
      if (stat.size <= position) return;

      const chunk = fs.createReadStream(logFile, { start: position, encoding: 'utf-8' });
      chunk.pipe(process.stdout, { end: false });
      position = stat.size;
    });

    process.on('SIGINT', () => {
      watcher.close();
      process.exit(0);
    });
  });
}
