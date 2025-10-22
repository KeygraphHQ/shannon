import { fs, path } from 'zx';
import chalk from 'chalk';
import { PentestError, logError } from '../error-handling.js';

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