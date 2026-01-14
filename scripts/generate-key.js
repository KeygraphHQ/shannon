#!/usr/bin/env node

/**
 * Generate a cryptographically secure API key for Shannon
 * 
 * Usage:
 *   node scripts/generate-key.js [--length 32]
 *   npm run generate-key
 */

import crypto from 'crypto';

const args = process.argv.slice(2);
const lengthIndex = args.indexOf('--length');
const length = lengthIndex !== -1 && args[lengthIndex + 1] 
  ? parseInt(args[lengthIndex + 1], 10) 
  : 32;

if (isNaN(length) || length < 16 || length > 128) {
  console.error('Error: Length must be between 16 and 128');
  process.exit(1);
}

const key = crypto.randomBytes(length).toString('base64url');

console.log('\n🔑 Generated API Key:\n');
console.log(`   ${key}\n`);
console.log('📋 Add to your configuration:');
console.log(`   api:
     api_key: "${key}"\n`);
console.log('🔒 Or use environment variable:');
console.log(`   export SHANNON_API_KEY="${key}"\n`);
