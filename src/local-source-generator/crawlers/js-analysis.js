import chalk from 'chalk';
import axios from 'axios';

export async function runJSAnalysis(webUrl, jsFiles, options = {}) {
  console.log(chalk.blue('  → Analyzing JavaScript files... '));
  
  const analysis = [];
  
  for (const jsUrl of jsFiles. slice(0, 10)) { // Limit to first 10 files
    try {
      const response = await axios.get(jsUrl);
      const content = response.data;
      
      // Extract API endpoints
      const apiEndpoints = content.match(/['"`](/api/[^'"`]+)['"`]/g) || [];
      
      // Check for auth patterns
      const hasAuth = /login|auth|token|session/i.test(content);
      
      analysis.push({
        url: jsUrl,
        endpoints: apiEndpoints. map(e => e.replace(/['"`]/g, '')),
        hasAuth
      });
    } catch (error) {
      // Skip failed fetches
    }
  }
  
  console.log(chalk.green(`    ✅ Analyzed ${analysis.length} JavaScript files`));
  
  return analysis;
}
