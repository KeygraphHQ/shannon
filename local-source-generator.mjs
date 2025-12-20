#!/usr/bin/env node

import { $, argv } from 'zx';
import { fs, path, which } from 'zx';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import playwright from 'playwright';
import cliProgress from 'cli-progress';

// Core reconnaissance tools
const TOOLS = {
    // Shannon already uses these: 
    nmap: 'nmap -F --open -Pn -T4',
    subfinder: 'subfinder -d',
    whatweb: 'whatweb --color=never',

    // Add these for black-box: 
    httpx: 'httpx -silent -tech-detect -status-code -title',
    katana: 'katana -silent -js-crawl -d 3',
    nuclei: 'nuclei -silent -t exposures/',
    arjun: 'arjun -u',  // Parameter discovery
    ffuf: 'ffuf -w /path/to/wordlist -u',  // Fuzzing
    gau: 'gau --subs',  // Fetch known URLs from archives
};

// Main generator
export async function generateLocalSource(webUrl, outputDir) {
    console.log(chalk.yellow.bold('\n🔍 LOCAL SOURCE GENERATOR'));

    const targetDomain = new URL(webUrl).hostname;
    const sourceDir = path.join(outputDir, 'repos', targetDomain);

    await fs.ensureDir(sourceDir);
    await fs.ensureDir(path.join(sourceDir, 'routes'));
    await fs.ensureDir(path.join(sourceDir, 'models'));
    await fs.ensureDir(path.join(sourceDir, 'config'));
    await fs.ensureDir(path.join(sourceDir, 'deliverables'));

    // Initialize Progress Bar
    const bar = new cliProgress.SingleBar({
        format: 'Progress |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total} Stages || {status}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);

    // Total steps: 1(Nmap) + 1(Sub/What) + 1(Crawl) + 1(Source) + 1(Report)
    bar.start(5, 0, { status: 'Starting...' });

    // Step 1: Network reconnaissance (Shannon-compatible)
    bar.update(0, { status: 'Network Reconnaissance...' });
    const nmapResults = await runNmap(webUrl);

    bar.update(1, { status: 'Domain & Tech Recon...' });
    const subfinderResults = await runSubfinder(targetDomain);
    const whatwebResults = await runWhatweb(webUrl);

    // Step 2: Active crawling
    bar.update(2, { status: 'Active Crawling & Analysis...' });
    const endpoints = await discoverEndpoints(webUrl);
    const jsFiles = await extractJavaScriptFiles(webUrl);
    const apiSchemas = await discoverAPISchemas(webUrl);

    // Step 3: Generate synthetic source files
    bar.update(3, { status: 'Generating Source Code...' });
    await generateRoutes(endpoints, path.join(sourceDir, 'routes'));
    await generateModels(apiSchemas, path.join(sourceDir, 'models'));
    await generateConfig(webUrl, path.join(sourceDir, 'config'));

    // Step 4: Create Shannon-compatible deliverable
    bar.update(4, { status: 'Finalizing Report...' });
    await generatePreReconDeliverable({
        nmap: nmapResults,
        subfinder: subfinderResults,
        whatweb: whatwebResults,
        endpoints,
        jsFiles,
        apiSchemas
    }, sourceDir);

    bar.update(5, { status: 'Done!' });
    bar.stop();

    console.log(chalk.green(`\n✅ Synthetic source generated at: ${sourceDir}`));
    return sourceDir;
}

// Wrapper for nmap
async function runNmap(webUrl) {
    const domain = new URL(webUrl).hostname;
    console.log(chalk.blue(`  🌩️  Running nmap on ${domain}...`));

    // Attempt to fix environment if nmap-services is missing
    await setupNmapEnvironment();

    try {
        const result = await $`${TOOLS.nmap.split(' ')} ${domain}`;
        return result.stdout;
    } catch (error) {
        console.log(chalk.yellow(`    ⚠️  Nmap failed: ${error.message}`));
        return `Nmap failed: ${error.message}`;
    }
}

// Helper: Setup Nmap environment
async function setupNmapEnvironment() {
    if (process.env.NMAPDIR) return;

    // Potential paths for nmap-services
    const candidates = [
        '/usr/local/share/nmap',
        '/usr/share/nmap',
        '/opt/homebrew/share/nmap'
    ];

    // Try to find via brew if available
    try {
        const brewPrefix = (await $`brew --prefix nmap`).stdout.trim();
        if (brewPrefix) {
            candidates.unshift(path.join(brewPrefix, 'share', 'nmap'));
        }
    } catch (e) {
        // brew not found or failed, ignore
    }

    for (const dir of candidates) {
        if (await fs.pathExists(path.join(dir, 'nmap-services'))) {
            process.env.NMAPDIR = dir;
            // console.log(chalk.gray(`    ℹ️  Set NMAPDIR to ${dir}`));
            return;
        }
    }
}

// Wrapper for subfinder
async function runSubfinder(domain) {
    console.log(chalk.blue(`  🔍 Running subfinder on ${domain}...`));
    try {
        const result = await $`${TOOLS.subfinder.split(' ')} ${domain}`;
        return result.stdout;
    } catch (error) {
        console.log(chalk.yellow(`    ⚠️  Subfinder failed: ${error.message}`));
        return `Subfinder failed: ${error.message}`;
    }
}

// Wrapper for whatweb
async function runWhatweb(webUrl) {
    console.log(chalk.blue(`  🌐 Running whatweb on ${webUrl}...`));
    try {
        const result = await $`${TOOLS.whatweb.split(' ')} ${webUrl}`;
        // Parse whatweb output for simple object representation
        // ... (Parsing logic can be added here if needed, for now just return raw output)
        return result.stdout;
    } catch (error) {
        console.log(chalk.yellow(`    ⚠️  Whatweb failed: ${error.message}`));
        return `Whatweb failed: ${error.message}`;
    }
}

// Discover endpoints via crawling
async function discoverEndpoints(webUrl) {
    console.log(chalk.blue('  🕷️  Crawling application for endpoints...'));

    const endpoints = [];

    // Use katana for JavaScript-aware crawling
    try {
        if (await which('katana', { nothrow: true })) {
            const result = await $`echo ${webUrl} | katana -silent -js-crawl -d 3 -timeout 30`;
            endpoints.push(...result.stdout.trim().split('\n'));
        } else {
            console.log(chalk.yellow('    ⚠️  Katana not found, skipping active crawling.'));
        }
    } catch (error) {
        console.log(chalk.yellow(`    ⚠️  Katana failed: ${error.message}`));
    }

    // Use gau for historical URL data
    try {
        // Fix: gau uses -t for threads, not --threads
        const result = await $`echo ${webUrl} | gau --subs -t 5`;
        endpoints.push(...result.stdout.trim().split('\n'));
    } catch (error) {
        console.log(chalk.yellow(`    ⚠️  GAU failed: ${error.message}`));
    }

    // Deduplicate and parse
    return [...new Set(endpoints)].map(url => parseEndpoint(url));
}

function parseEndpoint(urlString) {
    try {
        const url = new URL(urlString);
        const params = [];

        // Extract query parameters
        url.searchParams.forEach((value, key) => {
            params.push({
                name: key,
                location: 'query',
                type: isNaN(value) ? 'string' : 'number'
            });
        });

        return {
            method: 'GET', // Default to GET for crawled URLs
            path: url.pathname,
            source: urlString,
            params: params
        };
    } catch (e) {
        // Fallback for relative or malformed URLs
        return {
            method: 'GET',
            path: urlString,
            source: urlString,
            params: []
        };
    }
}

// Extract JavaScript files for client-side analysis
async function extractJavaScriptFiles(webUrl) {
    console.log(chalk.blue('  📜 Extracting JavaScript files...'));

    // Use Playwright to find all <script> tags
    let browser;
    try {
        browser = await playwright.chromium.launch({ headless: true });
    } catch (e) {
        console.log(chalk.yellow(`    ⚠️  Playwright failed to launch (browsers setup?): ${e.message.split('\n')[0]}`));
        console.log(chalk.yellow(`    ℹ️  Run 'npx playwright install' to enable JS analysis.`));
        return [];
    }

    const page = await browser.newPage();
    await page.goto(webUrl);

    const jsFiles = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        return scripts.map(s => s.src);
    });

    await browser.close();

    // Download and analyze JavaScript files
    const jsAnalysis = [];
    for (const jsUrl of jsFiles) {
        const content = await fetch(jsUrl).then(r => r.text());

        // Extract API endpoints from JS
        const apiEndpoints = content.match(/['"](\/api\/[^'"]+)['"]/g) || [];
        const authPatterns = content.match(/(login|auth|token|session)/gi) || [];

        jsAnalysis.push({
            url: jsUrl,
            endpoints: apiEndpoints.map(e => e.replace(/['"]/g, '')),
            hasAuth: authPatterns.length > 0
        });
    }

    return jsAnalysis;
}

// Discover API schemas (OpenAPI/Swagger)
async function discoverAPISchemas(webUrl) {
    console.log(chalk.blue('  📋 Discovering API schemas...'));

    const commonPaths = [
        '/swagger.json',
        '/api/swagger.json',
        '/api-docs',
        '/v2/api-docs',
        '/api/v1/swagger.json',
        '/openapi.json',
        '/api/openapi.json',
        '/.well-known/openapi.json'
    ];

    const schemas = [];
    for (const schemaPath of commonPaths) {
        try {
            const url = new URL(schemaPath, webUrl).toString();
            const response = await fetch(url);

            if (response.ok) {
                const schema = await response.json();
                schemas.push({ path: schemaPath, schema });
                console.log(chalk.green(`    ✅ Found schema: ${schemaPath}`));
            }
        } catch (error) {
            // Schema not found, continue
        }
    }

    return schemas;
}

// Generate synthetic route files
async function generateRoutes(endpoints, routesDir) {
    console.log(chalk.blue('  🛣️  Generating synthetic route files...'));

    // Group endpoints by base path
    const routeGroups = {};
    for (const endpoint of endpoints) {
        const basePath = endpoint.path.split('/')[1] || 'index';
        if (!routeGroups[basePath]) {
            routeGroups[basePath] = [];
        }
        routeGroups[basePath].push(endpoint);
    }

    // Create route files
    for (const [name, routes] of Object.entries(routeGroups)) {
        const routeFile = path.join(routesDir, `${name}.pseudo.js`);
        const content = generateRouteFileContent(routes);
        await fs.writeFile(routeFile, content);
    }
}

// Generate synthetic model files
async function generateModels(apiSchemas, modelsDir) {
    console.log(chalk.blue('  🧠 Generating synthetic model files...'));
    await fs.ensureDir(modelsDir);

    // Create a generic User model
    const userModel = `
// Synthetic User Model
module.exports = {
    schema: {
        username: 'string',
        password: 'string', // hash me
        email: 'string',
        role: 'string'
    },
    methods: ['find', 'findOne', 'create', 'update', 'delete']
};
`;
    await fs.writeFile(path.join(modelsDir, 'User.js'), userModel);

    // Create models from schemas if found
    for (const { path: schemaPath, schema } of apiSchemas) {
        // Simple extraction logic would go here
        // For now, dump the schema
        await fs.writeFile(
            path.join(modelsDir, `Schema_${path.basename(schemaPath)}.json`),
            JSON.stringify(schema, null, 2)
        );
    }
}

// Generate synthetic configuration
async function generateConfig(webUrl, configDir) {
    console.log(chalk.blue('  ⚙️  Generating synthetic config files...'));
    await fs.ensureDir(configDir);

    const configContent = `
// Synthetic Configuration
module.exports = {
    app: {
        url: '${webUrl}',
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    },
    database: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'secret' // Hardcoded secret candidate
    },
    keys: {
        jwt: 'synthetic-jwt-secret',
        api: 'synthetic-api-key'
    }
};
`;
    await fs.writeFile(path.join(configDir, 'default.js'), configContent);
}

// Generate route file content (Shannon-parseable)
function generateRouteFileContent(routes) {
    return `
// AUTO-GENERATED PSEUDO-SOURCE from LocalSourceGenerator
// This file represents discovered endpoints from black-box reconnaissance

${routes.map(route => `
// ${route.method} ${route.path}
// Discovered from: ${route.source}
// Parameters: ${JSON.stringify(route.params)}
app.${route.method.toLowerCase()}('${route.path}', async (req, res) => {
  // Input vectors: 
  ${route.params.map(p => `  // - req.${p.location}. ${p.name} (${p.type})`).join('\n')}
  
  // SHANNON NOTE: This is a synthetic route generated from black-box analysis. 
  // Actual implementation unknown.  Treat all parameters as untrusted.
});
`).join('\n')}
`;
}

// Generate Shannon-compatible pre_recon_deliverable. md
async function generatePreReconDeliverable(data, sourceDir) {
    const deliverable = `
# Pre-Reconnaissance Report (Generated from Black-Box Scan)

## Port Discovery (nmap)
${data.nmap}

## Subdomain Discovery (subfinder)
${data.subfinder}

## Technology Detection (whatweb)
${data.whatweb}

## Code Analysis (Synthetic)

### 1. Technology Stack

**Detected Technologies:**
${data.whatwebDetails ? data.whatwebDetails.map(tech => `- ${tech.name}: ${tech.version || 'Unknown'}`).join('\n') : '(See above for raw detection results)'}

**Note:** This is a synthetic code analysis generated from black-box reconnaissance. 
Actual source code is not available.  Shannon will operate with limited context.

### 2. Entry Points (Discovered Endpoints)

**Network-Accessible Endpoints:**
${data.endpoints.map(ep => `- ${ep.method} ${ep.path}`).join('\n')}

**Total Discovered:** ${data.endpoints.length} endpoints

### 3. API Schemas (Auto-Discovered)

${data.apiSchemas.length > 0 ?
            data.apiSchemas.map(s => `- ${s.path}`).join('\n') :
            'No OpenAPI/Swagger schemas found'
        }

### 4. JavaScript Files Analyzed

${data.jsFiles.map(js => `
**File:** ${js.url}
- Discovered API endpoints: ${js.endpoints.length}
- Authentication-related code: ${js.hasAuth ? 'Yes' : 'No'}
`).join('\n')}

### 9. Injection Sources (Discovered from Black-Box)

**⚠️ WARNING:** Without source code, injection sources are hypothesized from: 
1. Form inputs with dangerous parameter names (cmd, exec, query, sql)
2. URL parameters that accept complex values
3. File upload endpoints

**Command Injection Candidates:**
${identifyCommandInjectionCandidates(data.endpoints)}

**SQL Injection Candidates:**
${identifySQLInjectionCandidates(data.endpoints)}

**Note:** These are candidates only. Shannon exploitation phase will validate.

### 10.  SSRF Sinks (Hypothesized)

${identifySSRFCandidates(data.endpoints)}

---
**Report Generated:** ${new Date().toISOString()}
**Mode:** BLACK-BOX PSEUDO-SOURCE
  `;

    const deliverablePath = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    await fs.writeFile(deliverablePath, deliverable);
}

// Heuristic:  Identify potential command injection candidates
function identifyCommandInjectionCandidates(endpoints) {
    const dangerousParams = ['cmd', 'command', 'exec', 'ping', 'shell', 'run', 'execute'];

    const candidates = endpoints.filter(ep =>
        ep.params.some(p => dangerousParams.some(dp => p.name.toLowerCase().includes(dp)))
    );

    if (candidates.length === 0) return 'None identified from black-box analysis';

    return candidates.map(c =>
        `- ${c.method} ${c.path} (parameter: ${c.params.find(p => dangerousParams.some(dp => p.name.includes(dp))).name})`
    ).join('\n');
}

// Heuristic: Identify potential SQL injection candidates
function identifySQLInjectionCandidates(endpoints) {
    const sqlParams = ['id', 'user', 'search', 'query', 'filter', 'order', 'sort'];

    const candidates = endpoints.filter(ep =>
        ep.params.some(p => sqlParams.includes(p.name.toLowerCase()))
    );

    if (candidates.length === 0) return 'None identified from black-box analysis';

    return candidates.map(c =>
        `- ${c.method} ${c.path} (parameters: ${c.params.map(p => p.name).join(', ')})`
    ).join('\n');
}

// Heuristic: Identify potential SSRF candidates
function identifySSRFCandidates(endpoints) {
    const ssrfParams = ['url', 'uri', 'link', 'src', 'target', 'dest', 'source', 'webhook', 'callback'];

    const candidates = endpoints.filter(ep =>
        ep.params.some(p => ssrfParams.includes(p.name.toLowerCase()))
    );

    if (candidates.length === 0) return 'None identified from black-box analysis';

    return candidates.map(c =>
        `- ${c.method} ${c.path} (parameter: ${c.params.find(p => ssrfParams.includes(p.name)).name})`
    ).join('\n');
}

function printHelp() {
    console.log(`
${chalk.bold('Local Source Generator')}
Generates synthetic local source code from black-box reconnaissance of a target URL.

${chalk.bold('Usage:')}
  ./local-source-generator.mjs <url> [options]

${chalk.bold('Options:')}
  --help, -h      Show this help message
  --output, -o    Output directory (default: ./shannon-results)

${chalk.bold('Examples:')}
  ./local-source-generator.mjs https://example.com
  ./local-source-generator.mjs https://target.com -o ./my-audit
`);
}

// Main execution if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    if (argv.help || argv.h) {
        printHelp();
        process.exit(0);
    }

    const webUrl = argv._[0];
    const outputDir = argv.output || argv.o || './shannon-results';

    if (!webUrl) {
        console.error(chalk.red('Error: URL argument is required.'));
        printHelp();
        process.exit(1);
    }

    try {
        await generateLocalSource(webUrl, outputDir);
    } catch (error) {
        console.error(chalk.red('\n❌ Generation failed:'), error);
        process.exit(1);
    }
}