// MIT Licence applies - @Steake (Oliver Hirst)
// LocalSourceGenerator - Black-box to White-box adapter for Shannon
// Generates synthetic source code from black-box reconnaissance

import { fs, path } from 'zx';
import chalk from 'chalk';
import { runNetworkRecon } from './crawlers/network-recon. js';
import { runActiveCrawl } from './crawlers/active-crawl.js';
import { runJSAnalysis } from './crawlers/js-analysis.js';
import { buildPseudoSource } from './generators/pseudo-source-builder.js';

export async function generateLocalSource(webUrl, outputDir, options = {}) {
  console.log(chalk.cyan. bold('\n🔍 LOCAL SOURCE GENERATOR'));
  console.log(chalk.gray('─'. repeat(60)));
  
  const targetDomain = new URL(webUrl).hostname;
  const sourceDir = path.join(outputDir, 'repos', targetDomain);
  
  await fs.ensureDir(sourceDir);
  await fs.ensureDir(path.join(sourceDir, 'routes'));
  await fs.ensureDir(path. join(sourceDir, 'models'));
  await fs.ensureDir(path.join(sourceDir, 'config'));
  await fs.ensureDir(path. join(sourceDir, 'deliverables'));
  
  await fs.writeFile(
    path.join(sourceDir, '. synthetic-source'),
    JSON.stringify({ generated: new Date().toISOString(), url: webUrl })
  );
  
  console.log(chalk.yellow('\n📡 Phase 1: Network Reconnaissance'));
  const networkData = await runNetworkRecon(webUrl, options);
  
  console.log(chalk.yellow('\n🕷️  Phase 2: Active Crawling'));
  const crawlData = await runActiveCrawl(webUrl, options);
  
  console.log(chalk.yellow('\n📜 Phase 3: JavaScript Analysis'));
  const jsData = await runJSAnalysis(webUrl, crawlData. jsFiles, options);
  
  console.log(chalk.yellow('\n🏗️  Phase 4: Building Synthetic Source'));
  await buildPseudoSource({
    sourceDir,
    webUrl,
    networkData,
    crawlData,
    jsData
  });
  
  console.log(chalk.green. bold('\n✅ Synthetic source generated successfully!'));
  console.log(chalk.gray(`Location: ${sourceDir}`));
  
  return sourceDir;
}
