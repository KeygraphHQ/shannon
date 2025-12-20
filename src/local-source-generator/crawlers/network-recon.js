import { $, fs, path } from 'zx';
import chalk from 'chalk';

export async function runNetworkRecon(webUrl, options = {}) {
  const results = {
    nmap: null,
    subfinder: null,
    whatweb: null,
    httpx: null
  };
  
  const targetDomain = new URL(webUrl).hostname;
  
  try {
    console.log(chalk.blue('  → Running nmap... '));
    const nmapResult = await $`nmap -p- --open -Pn -T4 ${targetDomain}`.quiet();
    results.nmap = nmapResult.stdout;
    console.log(chalk.green('    ✅ nmap complete'));
  } catch (error) {
    console.log(chalk.gray('    ⏭️  nmap skipped (not available)'));
  }
  
  try {
    console.log(chalk.blue('  → Running subfinder...'));
    const subfinderResult = await $`subfinder -d ${targetDomain} -silent`.quiet();
    results.subfinder = subfinderResult.stdout;
    console.log(chalk.green('    ✅ subfinder complete'));
  } catch (error) {
    console.log(chalk.gray('    ⏭️  subfinder skipped (not available)'));
  }
  
  try {
    console.log(chalk.blue('  → Running whatweb... '));
    const whatwebResult = await $`whatweb --color=never ${webUrl}`.quiet();
    results.whatweb = whatwebResult.stdout;
    console.log(chalk.green('    ✅ whatweb complete'));
  } catch (error) {
    console.log(chalk.gray('    ⏭️  whatweb skipped (not available)'));
  }
  
  return results;
}
