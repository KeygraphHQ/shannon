import { fs } from 'zx';
import { path } from 'zx';

/**
 * Strips ANSI escape codes from a string
 * @param {string} str - String with ANSI codes
 * @returns {string} Clean string without ANSI codes
 */
function stripAnsi(str) {
  if (typeof str !== 'string') {
    return str;
  }

  // Remove ANSI escape sequences
  // This regex matches all common ANSI codes including:
  // - Colors (e.g., \x1b[32m)
  // - Cursor movement (e.g., \x1b[1;1H)
  // - Screen clearing (e.g., \x1b[0J)
  // - 256-color codes (e.g., \x1b[38;2;244;197;66m)
  return str.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][0-9];.*?\x07|\x1b\[[\d;]*m/g,
    ''
  );
}

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

  // Buffer for lines that might be overwritten (carriage return without newline)
  let stdoutBuffer = '';
  let stderrBuffer = '';

  // Store original stdout/stderr write functions
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  // Override stdout
  process.stdout.write = function(chunk, encoding, callback) {
    // Write colorized output to terminal
    originalStdoutWrite(chunk, encoding, callback);

    // Write plain text (without ANSI codes) to log file
    const cleanChunk = stripAnsi(chunk.toString());

    // Handle carriage returns - only log when we get a newline
    if (cleanChunk.includes('\r') && !cleanChunk.includes('\n')) {
      // Buffer this line - it will be overwritten in terminal
      stdoutBuffer = cleanChunk.replace(/\r/g, '');
    } else if (cleanChunk.includes('\n')) {
      // Flush buffer if exists, then write the new line
      if (stdoutBuffer) {
        stdoutBuffer = ''; // Clear buffer without writing (it was overwritten)
      }
      logStream.write(cleanChunk);
    } else {
      // Normal write
      logStream.write(cleanChunk);
    }

    return true;
  };

  // Override stderr
  process.stderr.write = function(chunk, encoding, callback) {
    // Write colorized output to terminal
    originalStderrWrite(chunk, encoding, callback);

    // Write plain text (without ANSI codes) to log file
    const cleanChunk = stripAnsi(chunk.toString());

    // Handle carriage returns - only log when we get a newline
    if (cleanChunk.includes('\r') && !cleanChunk.includes('\n')) {
      // Buffer this line - it will be overwritten in terminal
      stderrBuffer = cleanChunk.replace(/\r/g, '');
    } else if (cleanChunk.includes('\n')) {
      // Flush buffer if exists, then write the new line
      if (stderrBuffer) {
        stderrBuffer = ''; // Clear buffer without writing (it was overwritten)
      }
      logStream.write(cleanChunk);
    } else {
      // Normal write
      logStream.write(cleanChunk);
    }

    return true;
  };

  // Return cleanup function
  return async function cleanup() {
    // Restore original streams
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;

    // Flush any remaining buffers
    if (stdoutBuffer) {
      logStream.write(stdoutBuffer + '\n');
    }
    if (stderrBuffer) {
      logStream.write(stderrBuffer + '\n');
    }

    // Close the log stream
    return new Promise((resolve, reject) => {
      logStream.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };
}
