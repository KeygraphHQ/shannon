import chalk from 'chalk';

export class ProgressIndicator {
  constructor(message = 'Working...') {
    this.message = message;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.frameIndex = 0;
    this.interval = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.frameIndex = 0;

    this.interval = setInterval(() => {
      // Clear the line and write the spinner
      process.stdout.write(`\r${chalk.cyan(this.frames[this.frameIndex])} ${chalk.dim(this.message)}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 100);
  }

  updateMessage(newMessage) {
    this.message = newMessage;
  }

  stop() {
    if (!this.isRunning) return;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Clear the spinner line
    process.stdout.write('\r' + ' '.repeat(this.message.length + 5) + '\r');
    this.isRunning = false;
  }

  finish(successMessage = 'Complete') {
    this.stop();
    console.log(chalk.green(`✓ ${successMessage}`));
  }
}