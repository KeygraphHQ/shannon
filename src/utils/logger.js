import { fs } from 'zx';
import { path } from 'zx';

/**
 * Sets up logging to capture all stdout and stderr to a file
 * @param {string} logFilePath - Path to the log file
 * @returns {Promise<Function>} Cleanup function to restore original streams
 */
export async function setupLogging(logFilePath) {
  // Resolve to absolute path
  const absoluteLogPath = path.isAbsolute(logFilePath)
    ? logFilePath
    : path.join(process.cwd(), logFilePath);

  // Ensure the directory exists
  await fs.ensureDir(path.dirname(absoluteLogPath));

  // Create write stream for the log file
  const logStream = fs.createWriteStream(absoluteLogPath, { flags: 'a' });

  // Store original stdout/stderr write functions
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  // Override stdout
  process.stdout.write = function(chunk, encoding, callback) {
    // Write to both original stdout and log file
    originalStdoutWrite(chunk, encoding, callback);
    logStream.write(chunk, encoding);
    return true;
  };

  // Override stderr
  process.stderr.write = function(chunk, encoding, callback) {
    // Write to both original stderr and log file
    originalStderrWrite(chunk, encoding, callback);
    logStream.write(chunk, encoding);
    return true;
  };

  // Return cleanup function
  return async function cleanup() {
    // Restore original streams
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;

    // Close the log stream
    return new Promise((resolve, reject) => {
      logStream.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };
}
