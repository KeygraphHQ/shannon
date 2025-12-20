import chalk from 'chalk';
import axios from 'axios';

export async function runActiveCrawl(webUrl, options = {}) {
  console.log(chalk.blue('  → Discovering endpoints...'));
  
  const endpoints = [];
  const jsFiles = [];
  
  try {
    const response = await axios.get(webUrl, { timeout: 10000 });
    const html = response.data;
    
    const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/g);
    for (const match of scriptMatches) {
      try {
        jsFiles.push(new URL(match[1], webUrl).toString());
      } catch (e) {
        // Invalid URL, skip
      }
    }
    
    const linkMatches = html.matchAll(/<a[^>]+href=["']([^"']+)["']/g);
    for (const match of linkMatches) {
      try {
        const url = new URL(match[1], webUrl);
        if (url.origin === new URL(webUrl).origin) {
          endpoints.push({ method: 'GET', path: url.pathname, params: [] });
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  } catch (error) {
    console.log(chalk.yellow(`  ⚠️  Crawl error: ${error.message}`));
  }
  
  console.log(chalk.green(`    ✅ Found ${endpoints.length} endpoints, ${jsFiles.length} JS files`));
  
  return { endpoints, jsFiles };
}
