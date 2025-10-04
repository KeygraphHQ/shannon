import { fs, path, os } from 'zx';
import chalk from 'chalk';
import { PentestError, logError } from '../error-handling.js';

// Pure function: Save deliverables permanently to user directory
export async function savePermanentDeliverables(sourceDir, webUrl, repoPath, session, timingBreakdown, costBreakdown) {
  try {
    // Simple universal approach - try Documents, fallback to home
    const homeDir = os.homedir();
    const documentsDir = path.join(homeDir, 'Documents');

    // Use Documents if it exists, otherwise use home directory
    const baseDir = await fs.pathExists(documentsDir) ? documentsDir : homeDir;
    const permanentBaseDir = path.join(baseDir, 'pentest-deliverables');

    // Generate directory name from repo path and web URL
    const repoName = path.basename(repoPath);
    const webDomain = new URL(webUrl).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').split('.')[0];
    const dirName = `${webDomain}_${repoName}_${timestamp}`;
    const permanentDir = path.join(permanentBaseDir, dirName);

    // Ensure base directory exists
    await fs.ensureDir(permanentBaseDir);

    // Create the specific pentest directory
    await fs.ensureDir(permanentDir);

    // Copy deliverables folder if it exists
    const deliverablesSource = path.join(sourceDir, 'deliverables');
    const deliverablesDest = path.join(permanentDir, 'deliverables');

    if (await fs.pathExists(deliverablesSource)) {
      await fs.copy(deliverablesSource, deliverablesDest, { overwrite: true });
    }

    // Save metadata with session information
    const metadata = {
      session: {
        id: session.id,
        webUrl,
        repoPath,
        configFile: session.configFile,
        status: session.status,
        completedAgents: session.completedAgents,
        createdAt: session.createdAt,
        completedAt: new Date().toISOString()
      },
      timing: timingBreakdown,
      cost: costBreakdown,
      sourceDirectory: sourceDir,
      savedAt: new Date().toISOString()
    };

    await fs.writeJSON(path.join(permanentDir, 'metadata.json'), metadata, { spaces: 2 });

    // Copy prompts directory for reproducibility
    const promptsSource = path.join(import.meta.dirname, '..', '..', 'prompts');
    const promptsDest = path.join(permanentDir, 'prompts');

    if (await fs.pathExists(promptsSource)) {
      await fs.copy(promptsSource, promptsDest, { overwrite: true });
    }

    console.log(chalk.green(`✅ Deliverables saved to permanent location: ${permanentDir}`));
    return permanentDir;
  } catch (error) {
    // Non-fatal error - log but don't throw
    console.log(chalk.yellow(`⚠️ Failed to save permanent deliverables: ${error.message}`));
    return null;
  }
}

// Pure function: Save run metadata for debugging and reproducibility
export async function saveRunMetadata(sourceDir, webUrl, repoPath) {
  console.log(chalk.blue('💾 Saving run metadata...'));

  try {
    // Read package.json to get version info with error handling
    const packagePath = path.join(import.meta.dirname, '..', '..', 'package.json');
    let packageJson;
    try {
      packageJson = await fs.readJSON(packagePath);
    } catch (packageError) {
      throw new PentestError(
        `Cannot read package.json: ${packageError.message}`,
        'filesystem',
        false,
        { packagePath, originalError: packageError.message }
      );
    }

    const metadata = {
      timestamp: new Date().toISOString(),
      targets: { webUrl, repoPath },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd()
      },
      dependencies: {
        claudeCodeVersion: packageJson.dependencies?.['@anthropic-ai/claude-code'] || 'unknown',
        zxVersion: packageJson.dependencies?.['zx'] || 'unknown',
        chalkVersion: packageJson.dependencies?.['chalk'] || 'unknown'
      },
      execution: {
        args: process.argv,
        env: {
          PLAYWRIGHT_HEADLESS: process.env.PLAYWRIGHT_HEADLESS || 'true',
          NODE_ENV: process.env.NODE_ENV
        }
      }
    };

    const metadataPath = path.join(sourceDir, 'run-metadata.json');
    await fs.writeJSON(metadataPath, metadata, { spaces: 2 });

    console.log(chalk.green(`✅ Run metadata saved to: ${metadataPath}`));
    return metadata;
  } catch (error) {
    if (error instanceof PentestError) {
      await logError(error, 'Saving run metadata', sourceDir);
      throw error; // Re-throw PentestError to be handled by caller
    }

    const metadataError = new PentestError(
      `Run metadata saving failed: ${error.message}`,
      'filesystem',
      false,
      { sourceDir, originalError: error.message }
    );
    await logError(metadataError, 'Saving run metadata', sourceDir);
    throw metadataError;
  }
}