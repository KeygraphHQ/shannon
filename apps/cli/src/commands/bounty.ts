import path from 'node:path';
import { fetchProgram } from '../programs/fetcher.js';
import { parseProgram } from '../programs/parser.js';
import { saveProgram, loadProgram } from '../programs/store.js';
import { start } from './start.js';

// Reusing start command arguments parser logic (to be integrated in index.ts)
export interface BountyStartArgs {
  url: string;
  repo: string;
  program: string;
  refreshProgram?: boolean;
  workspace?: string;
  output?: string;
  pipelineTesting: boolean;
  debug: boolean;
  version: string;
}

export async function bountyStart(args: BountyStartArgs): Promise<void> {
  let programConfig;
  
  if (args.refreshProgram || args.program.startsWith('http')) {
    // Needs parsing
    const rawText = await fetchProgram(args.program);
    programConfig = await parseProgram(rawText);
    await saveProgram(programConfig);
  } else {
    // Attempt to load from store
    try {
      programConfig = await loadProgram(args.program);
    } catch {
      // Fallback to treat as file path
      const rawText = await fetchProgram(args.program);
      programConfig = await parseProgram(rawText);
      await saveProgram(programConfig);
    }
  }

  // Delegate to start, passing bountyConfig somehow... 
  // (We need to update start.ts or PipelineInput to accept bountyConfig)
  // For now we just call start.
  
  await start({
    url: args.url,
    repo: args.repo,
    workspace: args.workspace,
    output: args.output,
    pipelineTesting: args.pipelineTesting,
    debug: args.debug,
    version: args.version
  });
}
