// Copyright (C) 2025 Keygraph, Inc.
// GNU Affero General Public License version 3

/**
 * PIVOT - Mutation Family Library Test
 * Quick verification that mutation families work correctly
 */

import { EncodingMutator } from './EncodingMutatorSimple.js';
import { StructuralMutator } from './StructuralMutator.js';
import { MutationFamilyRegistry, ObstacleClassification } from './MutationFamilyRegistry.js';

function testEncodingMutator(): void {
  console.log('=== Testing EncodingMutator ===');
  const encoder = new EncodingMutator();
  const payload = '<script>alert(1)</script>';
  
  console.log('Available variants:', encoder.getVariants().length);
  
  // Test a few key encodings
  const testVariants: any[] = ['url_single', 'html_entity_named', 'unicode_escape', 'mixed_case'];
  
  for (const variant of testVariants) {
    try {
      const encoded = encoder.encode(payload, variant);
      console.log(`${variant}: ${encoded.substring(0, 50)}...`);
    } catch (error) {
      console.log(`${variant}: ERROR - ${error.message}`);
    }
  }
}

function testStructuralMutator(): void {
  console.log('\n=== Testing StructuralMutator ===');
  const mutator = new StructuralMutator();
  const payload = 'SELECT * FROM users';
  
  console.log('Available variants:', mutator.getVariants().length);
  
  // Test a few key mutations
  const testVariants: any[] = ['case_variation', 'comment_injection', 'parameter_pollution'];
  
  for (const variant of testVariants) {
    try {
      const mutated = mutator.mutate(payload, variant, { language: 'sql', paramName: 'query' });
      console.log(`${variant}: ${mutated.substring(0, 50)}...`);
    } catch (error) {
      console.log(`${variant}: ERROR - ${error.message}`);
    }
  }
}

function testMutationFamilyRegistry(): void {
  console.log('\n=== Testing MutationFamilyRegistry ===');
  const registry = new MutationFamilyRegistry();
  
  // Test classification mapping
  const testClassifications: ObstacleClassification[] = [
    'WAF_BLOCK',
    'SQL_INJECTION_SURFACE',
    'RATE_LIMIT',
    'UNKNOWN'
  ];
  
  for (const classification of testClassifications) {
    const families = registry.getFamiliesFor(classification);
    console.log(`${classification}: ${families.length} families`);
    
    for (const family of families) {
      console.log(`  - ${family.family} (priority: ${family.priority})`);
    }
  }
  
  // Test mutation generation
  console.log('\n=== Testing Mutation Generation ===');
  const payload = "' OR 1=1 --";
  const classification: ObstacleClassification = 'SQL_INJECTION_SURFACE';
  
  const mutations = registry.generateAllMutations(payload, classification, { paramName: 'id' });
  console.log(`Generated ${mutations.length} mutations for SQL injection`);
  
  // Show first 5 mutations
  for (let i = 0; i < Math.min(5, mutations.length); i++) {
    const mut = mutations[i];
    console.log(`${i + 1}. ${mut.family}.${mut.variant}: ${mut.payload.substring(0, 40)}... (confidence: ${mut.confidence})`);
  }
}

function main(): void {
  console.log('PIVOT Mutation Family Library Test\n');
  
  try {
    testEncodingMutator();
    testStructuralMutator();
    testMutationFamilyRegistry();
    
    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  main();
}

export { testEncodingMutator, testStructuralMutator, testMutationFamilyRegistry };