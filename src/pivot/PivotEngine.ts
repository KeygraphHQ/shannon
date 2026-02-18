// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * PIVOT - Consolidated Engine (Phases 2-9)
 * Unified implementation of the adversarial mutation engine with intelligent routing
 */

import { 
  ObstacleEvent, 
  ResponseFingerprint, 
  ResponseDelta, 
  ScoreVector,
  MutationResult,
  RoutingDecision,
  ObstacleClassification
} from '../types/pivot.js';

import { BaselineCapturer, BaselineStatistics } from './baseline/BaselineCapturer.js';
import { ResponseDeltaCalculator } from './baseline/ResponseDelta.js';
import { AnomalyBuffer } from './baseline/AnomalyBuffer.js';
import { SignalRuleRegistry } from './scoring/SignalRuleRegistry.js';
import { DeterministicScorer } from './scoring/DeterministicScorer.js';

// Import mutation families (to be implemented)
// import { EncodingMutator } from './mutation/EncodingMutator.js';
// import { StructuralMutator } from './mutation/StructuralMutator.js';
// import { TimingMutator } from './mutation/TimingMutator.js';
// import { ProtocolMutator } from './mutation/ProtocolMutator.js';

/**
 * PivotEngine - Consolidated implementation of Phases 2-9
 */
export class PivotEngine {
  // Phase 1 components
  private baselineCapturer: BaselineCapturer;
  private deltaCalculator: ResponseDeltaCalculator;
  private anomalyBuffer: AnomalyBuffer;
  
  // Phase 2 components
  private signalRuleRegistry: SignalRuleRegistry;
  private deterministicScorer: DeterministicScorer;
  
  // Phase 3 components (mutation families - stubbed for now)
  private mutationFamilies: Map<string, any> = new Map();
  
  // Phase 4 components (pattern signatures - stubbed for now)
  private patternSignatures: Map<string, any> = new Map();
  
  // Phase 5 components (routing)
  private routingWeights: Map<string, number> = new Map();
  private routingHistory: Array<{
    timestamp: string;
    obstacleId: string;
    decision: RoutingDecision;
    outcome: string;
  }> = [];
  
  // Phase 6 components (freestyle)
  private freestyleSuggestions: Array<{
    obstacleId: string;
    suggestion: any;
    outcome: string;
  }> = [];
  
  // Phase 7 components (review)
  private reviewReports: Map<string, any> = new Map();
  
  // Configuration
  private config: {
    maxDeterministicAttempts: number;
    freestyleEnabled: boolean;
    hybridThreshold: number;
    auditLogging: boolean;
  };

  constructor(config: Partial<typeof PivotEngine.prototype.config> = {}) {
    // Initialize configuration
    this.config = {
      maxDeterministicAttempts: 12,
      freestyleEnabled: true,
      hybridThreshold: 0.6,
      auditLogging: true,
      ...config
    };
    
    // Initialize Phase 1 components
    this.baselineCapturer = new BaselineCapturer();
    this.deltaCalculator = new ResponseDeltaCalculator();
    this.anomalyBuffer = new AnomalyBuffer();
    
    // Initialize Phase 2 components
    this.signalRuleRegistry = new SignalRuleRegistry();
    this.deterministicScorer = new DeterministicScorer(this.signalRuleRegistry);
    
    // Initialize mutation families (Phase 3 - stubbed)
    this.initializeMutationFamilies();
    
    // Initialize pattern signatures (Phase 4 - stubbed)
    this.initializePatternSignatures();
    
    // Initialize routing weights (Phase 5)
    this.initializeRoutingWeights();
    
    console.log('[PIVOT] Engine initialized with consolidated Phases 2-9');
  }

  /**
   * Initialize mutation families (Phase 3 - stubbed implementation)
   */
  private initializeMutationFamilies(): void {
    // Encoding mutations
    this.mutationFamilies.set('encoding', {
      name: 'encoding',
      variants: ['url', 'html', 'unicode', 'jsfuck', 'base64', 'hex', 'utf7', 'nullbyte'],
      apply: (payload: string, variant: string) => {
        // Stubbed implementation
        return `${variant}:${payload}`;
      }
    });
    
    // Structural mutations
    this.mutationFamilies.set('structural', {
      name: 'structural',
      variants: ['case', 'whitespace', 'comments', 'parameter_pollution', 'verb_tampering', 'content_type'],
      apply: (payload: string, variant: string) => {
        // Stubbed implementation
        return `struct_${variant}:${payload}`;
      }
    });
    
    // Timing mutations
    this.mutationFamilies.set('timing', {
      name: 'timing',
      variants: ['rate_variation', 'sequential', 'concurrent', 'delayed_retry', 'race_condition'],
      apply: (payload: string, variant: string) => {
        // Stubbed implementation
        return `timing_${variant}:${payload}`;
      }
    });
    
    // Protocol mutations
    this.mutationFamilies.set('protocol', {
      name: 'protocol',
      variants: ['http_version', 'header_injection', 'chunked_encoding', 'host_manipulation'],
      apply: (payload: string, variant: string) => {
        // Stubbed implementation
        return `proto_${variant}:${payload}`;
      }
    });
  }

  /**
   * Initialize pattern signatures (Phase 4 - stubbed implementation)
   */
  private initializePatternSignatures(): void {
    const signatures = [
      { id: 'WAF_GENERIC_BLOCK', patterns: ['403 Forbidden', 'Access Denied', 'Request blocked'], class: 'WAF_BLOCK', confidence: 0.9 },
      { id: 'SQL_ERROR_MYSQL', patterns: ['You have an error in your SQL syntax', 'mysql_fetch'], class: 'SQL_INJECTION_SURFACE', confidence: 0.95 },
      { id: 'CHAR_BLACKLIST', patterns: ['invalid character', 'character not allowed', 'illegal character'], class: 'CHARACTER_FILTER', confidence: 0.85 },
      { id: 'SSTI_ERROR', patterns: ['TemplateSyntaxError', 'jinja2.exceptions', 'Smarty Error'], class: 'TEMPLATE_INJECTION_SURFACE', confidence: 0.9 },
      { id: 'RATE_LIMIT', patterns: ['429 Too Many Requests', 'rate limit exceeded', 'slow down'], class: 'RATE_LIMIT', confidence: 0.95 },
      { id: 'AMBIGUOUS_500', patterns: ['500 Internal Server Error'], class: 'UNKNOWN', confidence: 0.4 },
      { id: 'EMPTY_RESPONSE', patterns: [], class: 'TIMEOUT_OR_DROP', confidence: 0.3 }
    ];
    
    signatures.forEach(sig => {
      this.patternSignatures.set(sig.id, sig);
    });
  }

  /**
   * Initialize routing weights (Phase 5)
   */
  private initializeRoutingWeights(): void {
    // Default weights from pattern signatures
    for (const [id, signature] of this.patternSignatures.entries()) {
      this.routingWeights.set(id, signature.confidence);
    }
  }

  /**
   * Main entry point - Process an obstacle event (Phase 5: Intelligent Router)
   */
  async processObstacle(event: ObstacleEvent): Promise<MutationResult> {
    console.log(`[PIVOT] Processing obstacle ${event.obstacle_id} in phase ${event.phase}`);
    
    // Step 1: Pattern matching (Phase 4)
    const patternMatches = this.matchPatterns(event.terminal_output);
    
    // Step 2: Routing decision (Phase 5)
    const routingDecision = this.calculateRoutingDecision(patternMatches, event);
    
    // Step 3: Execute based on routing decision
    let mutationResult: MutationResult;
    
    switch (routingDecision.lane) {
      case 'deterministic':
        mutationResult = await this.executeDeterministicLane(event, routingDecision);
        break;
        
      case 'freestyle':
        mutationResult = await this.executeFreestyleLane(event, routingDecision);
        break;
        
      case 'hybrid':
        mutationResult = await this.executeHybridLane(event, routingDecision);
        break;
        
      default:
        mutationResult = this.createAbandonmentResult('unknown_lane', event.engagement_id);
    }
    
    // Step 4: Log routing history (Phase 5)
    this.logRoutingDecision(event.obstacle_id, routingDecision, mutationResult);
    
    // Step 5: Check for post-engagement review (Phase 7)
    if (mutationResult.abandon) {
      this.scheduleReview(event.engagement_id);
    }
    
    return mutationResult;
  }

  /**
   * Match patterns against terminal output (Phase 4)
   */
  private matchPatterns(terminalOutput: string): Array<{
    patternId: string;
    confidence: number;
    classification: ObstacleClassification;
  }> {
    const matches: Array<{
      patternId: string;
      confidence: number;
      classification: ObstacleClassification;
    }> = [];
    
    for (const [patternId, signature] of this.patternSignatures.entries()) {
      let matched = false;
      
      if (signature.patterns.length === 0 && terminalOutput.trim() === '') {
        // Empty response pattern
        matched = true;
      } else {
        // Check each pattern
        for (const pattern of signature.patterns) {
          if (terminalOutput.toLowerCase().includes(pattern.toLowerCase())) {
            matched = true;
            break;
          }
        }
      }
      
      if (matched) {
        matches.push({
          patternId,
          confidence: signature.confidence,
          classification: signature.class as ObstacleClassification
        });
      }
    }
    
    // Sort by confidence (highest first)
    matches.sort((a, b) => b.confidence - a.confidence);
    
    return matches;
  }

  /**
   * Calculate routing decision (Phase 5)
   */
  private calculateRoutingDecision(
    patternMatches: Array<{ patternId: string; confidence: number; classification: ObstacleClassification }>,
    event: ObstacleEvent
  ): RoutingDecision {
    if (patternMatches.length === 0) {
      // No matches → freestyle with human review flag
      return {
        lane: 'freestyle',
        confidence: 0.1,
        matched_pattern: null,
        classification: 'UNKNOWN',
        reasoning: 'No pattern matches found',
        fallback_eligible: true
      };
    }
    
    const topMatch = patternMatches[0];
    const weight = this.routingWeights.get(topMatch.patternId) || topMatch.confidence;
    const weightedConfidence = topMatch.confidence * weight;
    
    let lane: 'deterministic' | 'freestyle' | 'hybrid';
    let reasoning: string;
    
    if (weightedConfidence > 0.75) {
      lane = 'deterministic';
      reasoning = `High confidence match: ${topMatch.patternId} (${weightedConfidence.toFixed(2)})`;
    } else if (weightedConfidence < 0.40) {
      lane = 'freestyle';
      reasoning = `Low confidence match: ${topMatch.patternId} (${weightedConfidence.toFixed(2)})`;
    } else {
      lane = 'hybrid';
      reasoning = `Medium confidence match: ${topMatch.patternId} (${weightedConfidence.toFixed(2)})`;
    }
    
    // Apply confidence decay signal if available
    const decayStatus = this.deterministicScorer.getConfidenceDecayStatus('unknown');
    if (decayStatus.decayDetected && lane === 'deterministic') {
      lane = 'hybrid';
      reasoning += ' + confidence decay detected';
    }
    
    return {
      lane,
      confidence: weightedConfidence,
      matched_pattern: topMatch.patternId,
      classification: topMatch.classification,
      reasoning,
      fallback_eligible: lane !== 'deterministic'
    };
  }

  /**
   * Execute deterministic lane (Phase 2 + Phase 3)
   */
  private async executeDeterministicLane(
    event: ObstacleEvent,
    routingDecision: RoutingDecision
  ): Promise<MutationResult> {
    console.log(`[PIVOT] Executing deterministic lane for ${event.obstacle_id}`);
    
    // Get baseline if not already captured
    let baseline = this.baselineCapturer.getBaseline(event.engagement_id);
    if (!baseline) {
      // In real implementation, would capture baseline from target URL
      baseline = {
        meanResponseTime: 150,
        stdDevResponseTime: 10,
        meanBodyLength: 1024,
        stdDevBodyLength: 50,
        commonHeaders: {},
        statusCode: 200,
        errorClass: null,
        sampleFingerprint: {} as ResponseFingerprint
      };
    }
    
    // Select mutation family based on classification
    const mutationFamily = this.selectMutationFamily(routingDecision.classification);
    
    // Generate mutation payload
    const payload = this.generateMutationPayload(event, mutationFamily);
    
    // In real implementation: Execute mutation and capture response
    // For now, create a mock response delta
    const mockDelta: ResponseDelta = {
      status_changed: Math.random() > 0.7,
      error_class_changed: Math.random() > 0.8,
      body_hash_changed: Math.random() > 0.5,
      body_length_delta: Math.random() * 0.3,
      timing_delta_std: Math.random() * 2,
      headers_added: [],
      headers_removed: [],
      headers_changed: {},
      body_contains_target: Math.random() > 0.6,
      raw_body_similarity: 0.7 + Math.random() * 0.3
    };
    
    // Score the delta (Phase 2)
    const scoreVector = this.deterministicScorer.evaluateDelta(
      mockDelta,
      event.obstacle_id,
      mutationFamily
    );
    
    // Check for progress/abandon
    const attemptCount = this.deterministicScorer.getAttemptCount(event.obstacle_id);
    const shouldAbandon = this.deterministicScorer.shouldAbandon(event.obstacle_id) ||
                         (attemptCount > 3 && !this.deterministicScorer.isMakingProgress(scoreVector.weighted_total));
    
    // Create mutation result
    const result: MutationResult = {
      strategy_used: `${mutationFamily}_${routingDecision.classification}`,
      lane_routed: 'deterministic',
      payload,
      confidence: routingDecision.confidence,
      score_vector: scoreVector,
      next_steps: shouldAbandon ? ['switch_to_freestyle'] : ['continue_deterministic'],
      abandon: shouldAbandon,
      human_review_flag: shouldAbandon && this.config.freestyleEnabled,
      trace_id: `${event.engagement_id}_${event.obstacle_id}_${Date.now()}`
    };
    
    // Log anomaly if delta has interesting changes
    if (this.deltaCalculator.hasAnyChange(mockDelta)) {
      const confidenceScore = this.deltaCalculator.calculateConfidenceScore(mockDelta);
      const changeSummary = this.deltaCalculator.getChangeSummary(mockDelta);
      
      this.anomalyBuffer.addDelta(
        event.engagement_id,
        mockDelta,
        confidenceScore,
        changeSummary,
        {
          mutation_strategy: result.strategy_used,
          payload,
          obstacle_id: event.obstacle_id
        }
      );
    }
    
    return result;
  }

  /**
   * Execute freestyle lane (Phase 6)
   */
  private async executeFreestyleLane(
    event: ObstacleEvent,
    routingDecision: RoutingDecision
  ): Promise<MutationResult> {
    console.log(`[PIVOT] Executing freestyle lane for ${event.obstacle_id}`);
    
    // Create freestyle brief (Phase 6)
    const freestyleBrief = this.createFreestyleBrief(event, routingDecision);
    
    // In real implementation: Call LLM with constrained prompt
    // For now, generate a mock suggestion
    const suggestion = {
      strategy: 'double_url_encode',
      mutation_family: 'encoding',
      payload_template: '{{payload}}',
      rationale: 'Double encoding bypasses some WAF filters'
    };
    
    // Validate and create mutation result
    const result: MutationResult = {
      strategy_used: suggestion.strategy,
      lane_routed: 'freestyle',
      payload: suggestion.payload_template.replace('{{payload}}', 'test_payload'),
      confidence: routingDecision.confidence * 0.7, // Reduced confidence for freestyle
      score_vector: {
        status_changed: 0,
        error_class_changed: 0,
        body_contains_target: 0,
        timing_delta: 0,
        payload_reflected: 0,
        body_length_delta: 0,
        new_headers: 0,
        weighted_total: 0
      },
      next_steps: ['validate_with_deterministic'],
      abandon: false,
      human_review_flag: routingDecision.confidence < 0.3,
      trace_id: `${event.engagement_id}_${event.obstacle_id}_${Date.now()}`
    };
    
    // Log freestyle suggestion (Phase 6)
    this.freestyleSuggestions.push({
      obstacleId: event.obstacle_id,
      suggestion,
      outcome: 'generated'
    });
    
    return result;
  }

  /**
   * Execute hybrid lane (Phase 5 + Phase 6)
   */
  private async executeHybridLane(
    event: ObstacleEvent,
    routingDecision: RoutingDecision
  ): Promise<MutationResult> {
    console.log(`[PIVOT] Executing hybrid lane for ${event.obstacle_id}`);
    
    // First try deterministic lane
    const deterministicResult = await this.executeDeterministicLane(event, routingDecision);
    
    // If deterministic fails, try freestyle
    if (deterministicResult.abandon || deterministicResult.human_review_flag) {
      console.log(`[PIVOT] Deterministic failed, switching to freestyle for ${event.obstacle_id}`);
      const freestyleResult = await this.executeFreestyleLane(event, routingDecision);
      
      // Combine results
      return {
        ...freestyleResult,
        lane_routed: 'hybrid',
        next_steps: ['hybrid_complete'],
        confidence: (deterministicResult.confidence + freestyleResult.confidence) / 2
      };
    }
    
    // Deterministic succeeded
    return {
      ...deterministicResult,
      lane_routed: 'hybrid',
      next_steps: ['hybrid_deterministic_success']
    };
  }

  /**
   * Select mutation family based on classification
   */
  private selectMutationFamily(classification: ObstacleClassification): string {
    // Simple mapping based on classification
    const mapping: Record<string, string> = {
      'WAF_BLOCK': 'encoding',
      'SQL_INJECTION_SURFACE': 'encoding',
      'CHARACTER_FILTER': 'structural',
      'TEMPLATE_INJECTION_SURFACE': 'encoding',
      'RATE_LIMIT': 'timing',
      'UNKNOWN': 'encoding',
      'TIMEOUT_OR_DROP': 'protocol'
    };
    
    return mapping[classification] || 'encoding';
  }

  /**
   * Generate mutation payload
   */
  private generateMutationPayload(event: ObstacleEvent, mutationFamily: string): string {
    const family = this.mutationFamilies.get(mutationFamily);
    if (!family) {
      return `default_payload_${Date.now()}`;
    }
    
    // Select a random variant
    const variant = family.variants[Math.floor(Math.random() * family.variants.length)];
    
    // Generate payload based on event context
    const basePayload = event.attempt_history.length > 0 
      ? event.attempt_history[event.attempt_history.length - 1].payload || 'test'
      : 'initial_payload';
    
    return family.apply(basePayload, variant);
  }

  /**
   * Create freestyle brief (Phase 6)
   */
  private createFreestyleBrief(event: ObstacleEvent, routingDecision: RoutingDecision): any {
    return {
      obstacle_classification: routingDecision.classification,
      phase: event.phase,
      terminal_output: event.terminal_output.substring(0, 1000), // Limit length
      attempted_mutations: event.attempt_history.map(a => a.strategy),
      deterministic_result: routingDecision.lane === 'hybrid' ? 'exhausted' : 'not_applicable'
    };
  }

  /**
   * Create abandonment result
   */
  private createAbandonmentResult(reason: string, engagementId: string): MutationResult {
    return {
      strategy_used: 'abandon',
      lane_routed: 'deterministic',
      payload: '',
      confidence: 0,
      score_vector: {
        status_changed: 0,
        error_class_changed: 0,
        body_contains_target: 0,
        timing_delta: 0,
        payload_reflected: 0,
        body_length_delta: 0,
        new_headers: 0,
        weighted_total: 0
      },
      next_steps: ['engagement_review'],
      abandon: true,
      human_review_flag: true,
      trace_id: `${engagementId}_abandon_${Date.now()}`
    };
  }

  /**
   * Log routing decision (Phase 5)
   */
  private logRoutingDecision(obstacleId: string, decision: RoutingDecision, result: MutationResult): void {
    this.routingHistory.push({
      timestamp: new Date().toISOString(),
      obstacleId,
      decision,
      outcome: result.abandon ? 'abandoned' : 'continued'
    });
    
    // Keep history manageable
    if (this.routingHistory.length > 1000) {
      this.routingHistory = this.routingHistory.slice(-500);
    }
  }

  /**
   * Schedule review (Phase 7)
   */
  private scheduleReview(engagementId: string): void {
    if (!this.reviewReports.has(engagementId)) {
      this.reviewReports.set(engagementId, {
        engagementId,
        scheduledAt: new Date().toISOString(),
        status: 'pending',
        anomalies: this.anomalyBuffer.getAnomalies(engagementId).length,
        routingDecisions: this.routingHistory.filter(r => r.obstacleId.startsWith(engagementId)).length
      });
      
      console.log(`[PIVOT] Review scheduled for engagement ${engagementId}`);
    }
  }

  /**
   * Run post-engagement review (Phase 7)
   */
  async runEngagementReview(engagementId: string): Promise<any> {
    console.log(`[PIVOT] Running review for engagement ${engagementId}`);
    
    const anomalies = this.anomalyBuffer.getAnomalies(engagementId);
    const routingHistory = this.routingHistory.filter(r => r.obstacleId.startsWith(engagementId));
    const freestyleSuggestions = this.freestyleSuggestions.filter(s => s.obstacleId.startsWith(engagementId));
    
    // Analyze misrouted obstacles
    const misrouted = routingHistory.filter(entry => {
      const shouldBeFreestyle = entry.decision.lane === 'deterministic' && 
                               entry.outcome === 'abandoned';
      const shouldBeDeterministic = entry.decision.lane === 'freestyle' && 
                                   freestyleSuggestions.some(s => s.obstacleId === entry.obstacleId && s.outcome === 'success');
      return shouldBeFreestyle || shouldBeDeterministic;
    });
    
    // Propose weight adjustments
    const weightAdjustments: Array<{ patternId: string; currentWeight: number; proposedDelta: number; reason: string }> = [];
    
    for (const entry of misrouted) {
      if (entry.decision.matched_pattern) {
        const currentWeight = this.routingWeights.get(entry.decision.matched_pattern) || 0.5;
        const adjustment = entry.decision.lane === 'deterministic' ? -0.1 : 0.1;
        
        weightAdjustments.push({
          patternId: entry.decision.matched_pattern,
          currentWeight,
          proposedDelta: adjustment,
          reason: `Misrouted obstacle ${entry.obstacleId} (${entry.decision.lane} → ${entry.outcome})`
        });
      }
    }
    
    // Create new pattern signatures from anomalies
    const newSignatures = this.analyzeAnomaliesForPatterns(anomalies);
    
    const report = {
      engagementId,
      reviewedAt: new Date().toISOString(),
      statistics: {
        totalObstacles: routingHistory.length,
        misroutedObstacles: misrouted.length,
        totalAnomalies: anomalies.length,
        freestyleSuggestions: freestyleSuggestions.length
      },
      weightAdjustments,
      newSignatures,
      recommendations: this.generateRecommendations(misrouted, anomalies, freestyleSuggestions)
    };
    
    this.reviewReports.set(engagementId, {
      ...this.reviewReports.get(engagementId),
      report,
      status: 'completed',
      completedAt: new Date().toISOString()
    });
    
    return report;
  }

  /**
   * Analyze anomalies for new pattern signatures
   */
  private analyzeAnomaliesForPatterns(anomalies: any[]): any[] {
    // Simple analysis - group by change summary
    const patternsByChange = new Map<string, { count: number; examples: any[] }>();
    
    for (const anomaly of anomalies) {
      const key = anomaly.change_summary;
      if (!patternsByChange.has(key)) {
        patternsByChange.set(key, { count: 0, examples: [] });
      }
      
      const entry = patternsByChange.get(key)!;
      entry.count++;
      if (entry.examples.length < 3) {
        entry.examples.push({
          terminal_output: anomaly.context?.target_url || 'unknown',
          mutation_strategy: anomaly.context?.mutation_strategy || 'unknown'
        });
      }
    }
    
    // Convert to potential signatures
    const signatures: any[] = [];
    for (const [changeSummary, data] of patternsByChange.entries()) {
      if (data.count >= 3) { // Minimum threshold
        signatures.push({
          pattern_id: `ANOMALY_${changeSummary.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
          patterns: [changeSummary],
          class: 'UNKNOWN',
          confidence: Math.min(0.7, data.count / 10), // Scale confidence
          source: 'anomaly_analysis',
          examples: data.examples
        });
      }
    }
    
    return signatures;
  }

  /**
   * Generate recommendations from review
   */
  private generateRecommendations(misrouted: any[], anomalies: any[], freestyleSuggestions: any[]): string[] {
    const recommendations: string[] = [];
    
    if (misrouted.length > 0) {
      recommendations.push(`Consider adjusting routing weights for ${misrouted.length} misrouted obstacles`);
    }
    
    if (anomalies.length > 10) {
      recommendations.push(`Investigate ${anomalies.length} anomalies for new pattern signatures`);
    }
    
    if (freestyleSuggestions.length > 5) {
      recommendations.push(`Promote successful freestyle suggestions to deterministic mutations`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('No significant issues detected in this engagement');
    }
    
    return recommendations;
  }

  /**
   * Apply weight updates from review (Phase 7)
   */
  applyWeightUpdates(updates: Array<{ patternId: string; delta: number }>): void {
    for (const update of updates) {
      const currentWeight = this.routingWeights.get(update.patternId) || 0.5;
      const newWeight = Math.max(0.1, Math.min(1.0, currentWeight + update.delta));
      this.routingWeights.set(update.patternId, newWeight);
      
      console.log(`[PIVOT] Updated weight for ${update.patternId}: ${currentWeight.toFixed(2)} → ${newWeight.toFixed(2)}`);
    }
  }

  /**
   * Add new pattern signature (Phase 4 + Phase 7)
   */
  addPatternSignature(signature: {
    id: string;
    patterns: string[];
    class: ObstacleClassification;
    confidence: number;
  }): void {
    this.patternSignatures.set(signature.id, signature);
    this.routingWeights.set(signature.id, signature.confidence);
    
    console.log(`[PIVOT] Added new pattern signature: ${signature.id}`);
  }

  /**
   * Get engine status
   */
  getStatus(): {
    phase1: { baselineCapturer: boolean; deltaCalculator: boolean; anomalyBuffer: boolean };
    phase2: { ruleRegistry: boolean; deterministicScorer: boolean };
    phase3: { mutationFamilies: number };
    phase4: { patternSignatures: number };
    phase5: { routingWeights: number; routingHistory: number };
    phase6: { freestyleSuggestions: number };
    phase7: { reviewReports: number };
    config: typeof this.config;
  } {
    return {
      phase1: {
        baselineCapturer: true,
        deltaCalculator: true,
        anomalyBuffer: true
      },
      phase2: {
        ruleRegistry: true,
        deterministicScorer: true
      },
      phase3: {
        mutationFamilies: this.mutationFamilies.size
      },
      phase4: {
        patternSignatures: this.patternSignatures.size
      },
      phase5: {
        routingWeights: this.routingWeights.size,
        routingHistory: this.routingHistory.length
      },
      phase6: {
        freestyleSuggestions: this.freestyleSuggestions.length
      },
      phase7: {
        reviewReports: this.reviewReports.size
      },
      config: this.config
    };
  }

  /**
   * Reset engine for new engagement
   */
  resetForEngagement(engagementId: string): void {
    // Clear attempt counts for this engagement
    const obstacleIds = this.routingHistory
      .filter(r => r.obstacleId.startsWith(engagementId))
      .map(r => r.obstacleId);
    
    for (const obstacleId of obstacleIds) {
      this.deterministicScorer.resetAttemptCount(obstacleId);
    }
    
    // Clear freestyle suggestions for this engagement
    this.freestyleSuggestions = this.freestyleSuggestions.filter(
      s => !s.obstacleId.startsWith(engagementId)
    );
    
    console.log(`[PIVOT] Reset engine for engagement ${engagementId}`);
  }

  /**
   * Export engine data for analysis
   */
  exportData(engagementId: string): any {
    return {
      engagementId,
      exportedAt: new Date().toISOString(),
      routingHistory: this.routingHistory.filter(r => r.obstacleId.startsWith(engagementId)),
      anomalies: this.anomalyBuffer.getAnomalies(engagementId),
      freestyleSuggestions: this.freestyleSuggestions.filter(s => s.obstacleId.startsWith(engagementId)),
      reviewReport: this.reviewReports.get(engagementId),
      engineStatus: this.getStatus()
    };
  }
}
