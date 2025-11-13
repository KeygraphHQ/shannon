// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { $ } from 'zx';
import chalk from 'chalk';

// Check availability of required tools
export const checkToolAvailability = async () => {
  const tools = ['nmap', 'subfinder', 'whatweb', 'schemathesis'];
  const availability = {};
  
  console.log(chalk.blue('🔧 Checking tool availability...'));
  
  for (const tool of tools) {
    try {
      await $`command -v ${tool}`;
      availability[tool] = true;
      console.log(chalk.green(`  ✅ ${tool} - available`));
    } catch {
      availability[tool] = false;
      console.log(chalk.yellow(`  ⚠️ ${tool} - not found`));
    }
  }
  
  return availability;
};

// Handle missing tools with user-friendly messages
export const handleMissingTools = (toolAvailability) => {
  const missing = Object.entries(toolAvailability)
    .filter(([tool, available]) => !available)
    .map(([tool]) => tool);
    
  if (missing.length > 0) {
    console.log(chalk.yellow(`\n⚠️ Missing tools: ${missing.join(', ')}`));
    console.log(chalk.gray('Some functionality will be limited. Install missing tools for full capability.'));
    
    // Provide installation hints
    const installHints = {
      'nmap': 'brew install nmap (macOS) or apt install nmap (Ubuntu)',
      'subfinder': 'go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
      'whatweb': 'gem install whatweb',
      'schemathesis': 'pip install schemathesis'
    };
    
    console.log(chalk.gray('\nInstallation hints:'));
    missing.forEach(tool => {
      if (installHints[tool]) {
        console.log(chalk.gray(`  ${tool}: ${installHints[tool]}`));
      }
    });
    console.log('');
  }

  return missing;
};
