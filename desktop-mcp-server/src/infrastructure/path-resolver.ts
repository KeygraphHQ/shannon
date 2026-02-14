/**
 * Path Resolver
 *
 * Resolves paths relative to the Shannon installation root.
 * Handles repos/, configs/, audit-logs/ directories and
 * translates host paths to container paths for Docker.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PathResolver {
  readonly shannonRoot: string;

  constructor(shannonRoot?: string) {
    if (shannonRoot) {
      this.shannonRoot = path.resolve(shannonRoot);
    } else if (process.env['SHANNON_ROOT']) {
      this.shannonRoot = path.resolve(process.env['SHANNON_ROOT']);
    } else {
      // Walk up from dist/infrastructure/ to find the Shannon root
      // desktop-mcp-server/dist/infrastructure/path-resolver.js -> shannon/
      this.shannonRoot = path.resolve(__dirname, '..', '..', '..');
    }
  }

  get reposDir(): string {
    return path.join(this.shannonRoot, 'repos');
  }

  get configsDir(): string {
    return path.join(this.shannonRoot, 'configs');
  }

  get auditLogsDir(): string {
    return path.join(this.shannonRoot, 'audit-logs');
  }

  get composeFile(): string {
    return path.join(this.shannonRoot, 'docker-compose.yml');
  }

  get configSchemaPath(): string {
    return path.join(this.shannonRoot, 'configs', 'config-schema.json');
  }

  /**
   * Check if a repo exists in repos/ and return its absolute path.
   */
  async resolveRepo(repoName: string): Promise<string | null> {
    const repoPath = path.join(this.reposDir, repoName);
    try {
      const stat = await fs.stat(repoPath);
      if (stat.isDirectory()) {
        return repoPath;
      }
    } catch {
      // Does not exist
    }
    return null;
  }

  /**
   * Resolve a config file path. Accepts absolute paths or names relative to configs/.
   */
  async resolveConfig(configName: string): Promise<string | null> {
    // If absolute path, use directly
    if (path.isAbsolute(configName)) {
      try {
        await fs.access(configName);
        return configName;
      } catch {
        return null;
      }
    }

    // Try relative to configs/
    const configPath = path.join(this.configsDir, configName);
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      return null;
    }
  }

  /**
   * Resolve an audit-log directory for a workflow ID.
   */
  async resolveAuditLog(workflowId: string): Promise<string | null> {
    const auditPath = path.join(this.auditLogsDir, workflowId);
    try {
      const stat = await fs.stat(auditPath);
      if (stat.isDirectory()) {
        return auditPath;
      }
    } catch {
      // Does not exist
    }
    return null;
  }

  /**
   * Translate a host repo name to the container path (/repos/<name>).
   */
  toContainerRepoPath(repoName: string): string {
    return `/repos/${repoName}`;
  }

  /**
   * List all repos in the repos/ directory.
   */
  async listRepos(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.reposDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  /**
   * List all YAML config files in configs/.
   */
  async listConfigs(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.configsDir);
      return entries.filter(
        (e) => e.endsWith('.yaml') || e.endsWith('.yml')
      );
    } catch {
      return [];
    }
  }

  /**
   * List all audit log directories (workflow IDs).
   */
  async listAuditLogs(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.auditLogsDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }
}
