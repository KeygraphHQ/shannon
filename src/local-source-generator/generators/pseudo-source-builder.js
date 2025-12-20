import { fs, path } from 'zx';
import chalk from 'chalk';

export async function buildPseudoSource(data) {
  const { sourceDir, webUrl, networkData, crawlData, jsData } = data;
  
  // Generate routes
  await generateRoutes(crawlData.endpoints, path.join(sourceDir, 'routes'));
  
  // Generate config
  await generateConfig(webUrl, path.join(sourceDir, 'config'));
  
  // Generate pre_recon_deliverable. md
  await generatePreReconDeliverable(data, sourceDir);
  
  console.log(chalk.green('  ✅ Pseudo source files created'));
}

async function generateRoutes(endpoints, routesDir) {
  const content = `
// AUTO-GENERATED PSEUDO-SOURCE from LocalSourceGenerator
// This file represents discovered endpoints from black-box reconnaissance

${endpoints.map(ep => `
// ${ep.method} ${ep.path}
app.${ep.method. toLowerCase()}('${ep.path}', async (req, res) => {
  // SHANNON NOTE:  Synthetic route - actual implementation unknown
  // Treat all parameters as untrusted
});
`).join('\n')}
`;
  
  await fs.writeFile(path.join(routesDir, 'discovered. pseudo. js'), content);
}

async function generateConfig(webUrl, configDir) {
  const config = {
    url: webUrl,
    generatedAt: new Date().toISOString(),
    mode: 'black-box-synthetic'
  };
  
  await fs.writeFile(
    path.join(configDir, 'generator.json'),
    JSON.stringify(config, null, 2)
  );
}

async function generatePreReconDeliverable(data, sourceDir) {
  const { webUrl, networkData, crawlData, jsData } = data;
  
  const deliverable = `
# Pre-Reconnaissance Report (BLACK-BOX SYNTHETIC)

⚠️ **WARNING:** This deliverable was generated from black-box reconnaissance. 
Actual source code is not available.  Shannon will operate with limited context.

## Network Scanning (nmap)
${networkData.nmap || 'Not available'}

## Subdomain Discovery (subfinder)
${networkData.subfinder || 'Not available'}

## Technology Detection (whatweb)
${networkData.whatweb || 'Not available'}

## Code Analysis (Synthetic)

### Entry Points (Discovered Endpoints)

**Total Discovered:** ${crawlData.endpoints.length} endpoints

${crawlData.endpoints.map(ep => `- ${ep.method} ${ep. path}`).join('\n')}

### JavaScript Files Analyzed

**Total Analyzed:** ${jsData.length} files

${jsData.map(js => `
**File:** ${js.url}
- API endpoints found: ${js.endpoints.length}
- Authentication code:  ${js.hasAuth ? 'Yes' : 'No'}
`).join('\n')}

---
**Generated:** ${new Date().toISOString()}
**Mode:** BLACK-BOX PSEUDO-SOURCE
**Target:** ${webUrl}
`;
  
  await fs.writeFile(
    path.join(sourceDir, 'deliverables', 'pre_recon_deliverable.md'),
    deliverable
  );
}
