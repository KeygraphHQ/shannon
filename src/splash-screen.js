import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';
import chalk from 'chalk';
import { fs, path } from 'zx';

export const displaySplashScreen = async () => {
  try {
    // Get version info from package.json
    const packagePath = path.join(import.meta.dirname, '..', 'package.json');
    const packageJson = await fs.readJSON(packagePath);
    const version = packageJson.version || '1.0.0';

    // Create the main SHANNON ASCII art
    const shannonText = figlet.textSync('SHANNON', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    });

    // Apply golden gradient to SHANNON
    const gradientShannon = gradient(['#F4C542', '#FFD700'])(shannonText);

    // Create minimal tagline with styling
    const tagline = chalk.bold.white('AI Penetration Testing Framework');
    const versionInfo = chalk.gray(`v${version}`);

    // Build the complete splash content
    const content = [
      gradientShannon,
      '',
      chalk.bold.cyan('                 ╔════════════════════════════════════╗'),
      chalk.bold.cyan('                 ║') + '  ' + tagline + '  ' + chalk.bold.cyan('║'),
      chalk.bold.cyan('                 ╚════════════════════════════════════╝'),
      '',
      `                            ${versionInfo}`,
      '',
      chalk.bold.yellow('                      🔐 DEFENSIVE SECURITY ONLY 🔐'),
      ''
    ].join('\n');

    // Create boxed output with minimal styling
    const boxedContent = boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'cyan',
      dimBorder: false
    });

    // Clear screen and display splash
    console.clear();
    console.log(boxedContent);

    // Add loading animation
    const loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;

    return new Promise((resolve) => {
      const loadingInterval = setInterval(() => {
        process.stdout.write(`\r${chalk.cyan(loadingFrames[frameIndex])} ${chalk.dim('Initializing systems...')}`);
        frameIndex = (frameIndex + 1) % loadingFrames.length;
      }, 100);

      setTimeout(() => {
        clearInterval(loadingInterval);
        process.stdout.write(`\r${chalk.green('✓')} ${chalk.dim('Systems initialized.        ')}\n\n`);
        resolve();
      }, 2000);
    });

  } catch (error) {
    // Fallback to simple splash if anything fails
    console.log(chalk.cyan.bold('\n🚀 SHANNON - AI Penetration Testing Framework\n'));
    console.log(chalk.yellow('⚠️  Could not load full splash screen:', error.message));
    console.log('');
  }
};