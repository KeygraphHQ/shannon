// Copyright (C) 2025 Keygraph, Inc.
// GNU Affero General Public License version 3

/**
 * PIVOT - Phase 3: Mutation Family Library
 * MutationFamilyRegistry - Maps obstacle classifications to eligible mutation families
 */

import { EncodingMutator } from './EncodingMutatorSimple.js';
import { StructuralMutator } from './StructuralMutator.js';

export type ObstacleClassification =
  | 'WAF_BLOCK'
  | 'SQL_INJECTION_SURFACE'
  | 'XSS_SURFACE'
  | 'TEMPLATE_INJECTION_SURFACE'
  | 'CHARACTER_FILTER'
  | 'RATE_LIMIT'
  | 'TIMEOUT_OR_DROP'
  | 'UNKNOWN'
  | 'AUTH_FAILURE'
  | 'PATH_TRAVERSAL_SURFACE'
  | 'COMMAND_INJECTION_SURFACE'
  | 'XXE_SURFACE'
  | 'DESERIALIZATION_SURFACE';

export type MutationFamily =
  | 'encoding'
  | 'structural'
  | 'timing'
  | 'protocol';

export interface MutationFamilyConfig {
  family: MutationFamily;
  variants: string[];
  priority: number; // 1 = highest priority
  description: string;
  applicableTo: ObstacleClassification[];
}

export interface MutationResult {
  family: MutationFamily;
  variant: string;
  payload: string;
  confidence: number;
  metadata?: Record<string, any>;
}

/**
 * MutationFamilyRegistry - Central registry for mutation families
 */
export class MutationFamilyRegistry {
  private encodingMutator: EncodingMutator;
  private structuralMutator: StructuralMutator;
  private familyConfigs: Map<MutationFamily, MutationFamilyConfig>;
  private classificationMap: Map<ObstacleClassification, MutationFamilyConfig[]>;

  constructor() {
    this.encodingMutator = new EncodingMutator();
    this.structuralMutator = new StructuralMutator();
    this.familyConfigs = new Map();
    this.classificationMap = new Map();
    this.initializeConfigs();
  }

  /**
   * Get mutation families for a specific obstacle classification
   */
  getFamiliesFor(classification: ObstacleClassification): MutationFamilyConfig[] {
    return this.classificationMap.get(classification) || [];
  }

  /**
   * Get all mutation families
   */
  getAllFamilies(): MutationFamilyConfig[] {
    return Array.from(this.familyConfigs.values());
  }

  /**
   * Apply a specific mutation variant to a payload
   */
  applyMutation(
    payload: string,
    family: MutationFamily,
    variant: string,
    context?: any
  ): MutationResult {
    let mutatedPayload: string;
    let confidence = 0.7; // Default confidence

    switch (family) {
      case 'encoding':
        mutatedPayload = this.encodingMutator.encode(payload, variant as any);
        confidence = 0.8;
        break;

      case 'structural':
        mutatedPayload = this.structuralMutator.mutate(payload, variant as any, context);
        confidence = 0.6;
        break;

      case 'timing':
        mutatedPayload = this.applyTimingMutation(payload, variant, context);
        confidence = 0.5;
        break;

      case 'protocol':
        mutatedPayload = this.applyProtocolMutation(payload, variant, context);
        confidence = 0.4;
        break;

      default:
        throw new Error(`Unknown mutation family: ${family}`);
    }

    return {
      family,
      variant,
      payload: mutatedPayload,
      confidence,
      metadata: { originalPayload: payload, context }
    };
  }

  /**
   * Generate all possible mutations for a payload and classification
   */
  generateAllMutations(
    payload: string,
    classification: ObstacleClassification,
    context?: any
  ): MutationResult[] {
    const families = this.getFamiliesFor(classification);
    const results: MutationResult[] = [];

    for (const config of families) {
      for (const variant of config.variants) {
        try {
          const result = this.applyMutation(payload, config.family, variant, context);
          results.push(result);
        } catch {
          // Skip failed mutations
        }
      }
    }

    // Sort by priority (highest first)
    return results.sort((a, b) => {
      const aConfig = this.familyConfigs.get(a.family);
      const bConfig = this.familyConfigs.get(b.family);
      return (bConfig?.priority || 0) - (aConfig?.priority || 0);
    });
  }

  /**
   * Get recommended mutation families for bypassing a specific defense
   */
  getFamiliesForBypassTarget(target: string): MutationFamilyConfig[] {
    const matching: MutationFamilyConfig[] = [];

    for (const config of this.familyConfigs.values()) {
      if (config.description.toLowerCase().includes(target.toLowerCase())) {
        matching.push(config);
      }
    }

    return matching.sort((a, b) => a.priority - b.priority);
  }

  private initializeConfigs(): void {
    // ─── Encoding Family ──────────────────────────────────────────────────

    const encodingConfig: MutationFamilyConfig = {
      family: 'encoding',
      variants: this.encodingMutator.getVariants(),
      priority: 1,
      description: 'Encoding mutations for WAF bypass and obfuscation',
      applicableTo: [
        'WAF_BLOCK',
        'SQL_INJECTION_SURFACE',
        'XSS_SURFACE',
        'TEMPLATE_INJECTION_SURFACE',
        'CHARACTER_FILTER',
        'UNKNOWN'
      ]
    };

    // ─── Structural Family ────────────────────────────────────────────────

    const structuralConfig: MutationFamilyConfig = {
      family: 'structural',
      variants: this.structuralMutator.getVariants(),
      priority: 2,
      description: 'Structural mutations to break parsing and tokenization',
      applicableTo: [
        'WAF_BLOCK',
        'SQL_INJECTION_SURFACE',
        'XSS_SURFACE',
        'TEMPLATE_INJECTION_SURFACE',
        'CHARACTER_FILTER',
        'PATH_TRAVERSAL_SURFACE',
        'COMMAND_INJECTION_SURFACE',
        'UNKNOWN'
      ]
    };

    // ─── Timing Family ────────────────────────────────────────────────────

    const timingConfig: MutationFamilyConfig = {
      family: 'timing',
      variants: ['rate_variation', 'concurrent_delivery', 'delayed_retry', 'race_condition'],
      priority: 3,
      description: 'Timing-based mutations for race conditions and rate limit bypass',
      applicableTo: ['RATE_LIMIT', 'TIMEOUT_OR_DROP', 'UNKNOWN']
    };

    // ─── Protocol Family ──────────────────────────────────────────────────

    const protocolConfig: MutationFamilyConfig = {
      family: 'protocol',
      variants: ['http_version_switch', 'header_injection', 'chunked_encoding', 'host_manipulation'],
      priority: 4,
      description: 'Protocol-level mutations for parser confusion',
      applicableTo: ['WAF_BLOCK', 'AUTH_FAILURE', 'UNKNOWN']
    };

    // Register all families
    this.familyConfigs.set('encoding', encodingConfig);
    this.familyConfigs.set('structural', structuralConfig);
    this.familyConfigs.set('timing', timingConfig);
    this.familyConfigs.set('protocol', protocolConfig);

    // Build classification map
    for (const config of this.familyConfigs.values()) {
      for (const classification of config.applicableTo) {
        if (!this.classificationMap.has(classification)) {
          this.classificationMap.set(classification, []);
        }
        this.classificationMap.get(classification)!.push(config);
      }
    }

    // Sort each classification's families by priority
    for (const [classification, families] of this.classificationMap.entries()) {
      families.sort((a, b) => a.priority - b.priority);
    }
  }

  private applyTimingMutation(payload: string, variant: string, context?: any): string {
    switch (variant) {
      case 'rate_variation':
        // Add random delays between characters
        return payload; // Actual rate variation handled at HTTP layer
      
      case 'concurrent_delivery':
        // Split payload for concurrent delivery
        return payload; // Concurrent delivery handled at orchestration layer
      
      case 'delayed_retry':
        // Add delay markers
        return `DELAY:5000:${payload}`;
      
      case 'race_condition':
        // Race condition attempt template
        return `RACE:${payload}:${payload}`;
      
      default:
        return payload;
    }
  }

  private applyProtocolMutation(payload: string, variant: string, context?: any): string {
    switch (variant) {
      case 'http_version_switch':
        // HTTP/1.1 vs HTTP/2 switching
        return payload; // Protocol switching handled at HTTP layer
      
      case 'header_injection':
        // Header injection variants
        return `HEADER_INJECT:${payload}`;
      
      case 'chunked_encoding':
        // Chunked transfer encoding
        return this.structuralMutator.mutate(payload, 'chunked_encoding', context);
      
      case 'host_manipulation':
        // Host header manipulation
        return this.structuralMutator.mutate(payload, 'host_header_manipulation', context);
      
      default:
        return payload;
    }
  }

  /**
   * Export configuration for persistence
   */
  exportConfig(): Record<string, any> {
    const config: Record<string, any> = {
      families: {},
      classifications: {}
    };

    for (const [family, familyConfig] of this.familyConfigs.entries()) {
      config.families[family] = {
        variants: familyConfig.variants,
        priority: familyConfig.priority,
        description: familyConfig.description,
        applicableTo: familyConfig.applicableTo
      };
    }

    for (const [classification, families] of this.classificationMap.entries()) {
      config.classifications[classification] = families.map(f => ({
        family: f.family,
        priority: f.priority
      }));
    }

    return config;
  }

  /**
   * Import configuration from persisted data
   */
  importConfig(config: Record<string, any>): void {
    // Clear existing configs
    this.familyConfigs.clear();
    this.classificationMap.clear();

    // Re-initialize with imported config
    if (config.families) {
      // This is a simplified import - in production you'd want full validation
      this.initializeConfigs();
    }
  }
}