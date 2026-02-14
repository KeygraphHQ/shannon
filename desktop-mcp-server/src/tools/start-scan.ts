/**
 * start_scan Tool
 *
 * Starts a new Shannon pentest pipeline workflow.
 * Validates inputs, ensures Docker infrastructure is running,
 * then submits the workflow to Temporal.
 */

import fs from 'fs/promises';
import path from 'path';
import type { PathResolver } from '../infrastructure/path-resolver.js';
import type { TemporalBridge } from '../infrastructure/temporal-client.js';
import { ensureContainers, getDockerStatus } from '../infrastructure/docker-bridge.js';
import { toolSuccess, toolError, type ToolResult, type PipelineInput } from '../types.js';

export interface StartScanInput {
  url: string;
  repo: string;
  config?: string;
  output?: string;
  pipeline_testing?: boolean;
  workflow_id?: string;
}

export async function startScan(
  input: StartScanInput,
  paths: PathResolver,
  temporal: TemporalBridge
): Promise<ToolResult> {
  // 1. Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch {
    return toolError('Invalid URL format', { url: input.url });
  }

  // 2. Validate repo exists
  const repoPath = await paths.resolveRepo(input.repo);
  if (!repoPath) {
    const available = await paths.listRepos();
    return toolError(`Repository not found: ${input.repo}`, {
      suggestion: 'Repository must be a folder inside ./repos/',
      available_repos: available,
    });
  }

  // 3. Validate config if provided
  let configPath: string | undefined;
  if (input.config) {
    const resolved = await paths.resolveConfig(input.config);
    if (!resolved) {
      const available = await paths.listConfigs();
      return toolError(`Config file not found: ${input.config}`, {
        suggestion: 'Config must be a file in ./configs/ or an absolute path',
        available_configs: available,
      });
    }
    configPath = resolved;
  }

  // 4. Ensure Docker infrastructure is running
  const status = await getDockerStatus(paths);
  if (!status.available) {
    return toolError('Docker is not available. Please start Docker Desktop and try again.');
  }

  if (!status.temporalHealthy) {
    try {
      await ensureContainers(paths);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return toolError(`Failed to start Shannon containers: ${errMsg}`);
    }
  }

  // 5. Ensure deliverables directory is writable
  const deliverablesDir = path.join(repoPath, 'deliverables');
  try {
    await fs.mkdir(deliverablesDir, { recursive: true });
  } catch {
    // Best effort
  }

  // 6. Generate workflow ID
  const hostname = parsedUrl.hostname.replace(/[^a-zA-Z0-9-]/g, '-');
  const workflowId = input.workflow_id ?? `${hostname}_shannon-${Date.now()}`;

  // 7. Build pipeline input with container paths
  const containerRepoPath = paths.toContainerRepoPath(input.repo);
  const pipelineInput: PipelineInput = {
    webUrl: input.url,
    repoPath: containerRepoPath,
    workflowId,
  };

  if (configPath) {
    // Config is mounted at /app/configs/ in the container
    const configName = path.basename(configPath);
    pipelineInput.configPath = `/app/configs/${configName}`;
  }

  if (input.output) {
    pipelineInput.outputPath = '/app/output';
  }

  if (input.pipeline_testing) {
    pipelineInput.pipelineTestingMode = true;
  }

  // 8. Start the workflow
  try {
    await temporal.startWorkflow(pipelineInput, workflowId);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return toolError(`Failed to start workflow: ${errMsg}`);
  }

  return toolSuccess({
    workflowId,
    status: 'started',
    target: input.url,
    repo: input.repo,
    config: input.config ?? null,
    monitor: {
      web_ui: `http://localhost:8233/namespaces/default/workflows/${workflowId}`,
      query: `Use the query_progress tool with workflowId: "${workflowId}"`,
    },
  });
}
