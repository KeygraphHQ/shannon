// Copyright (C) 2025 Keygraph, Inc.
// GNU Affero General Public License version 3

/**
 * PIVOT - PivotEngine (Wired)
 * Real HTTP execution, real mutation families, deterministic scoring on actual responses
 * No mock data. No Math.random() in the hot path.
 */

import {
  ObstacleEvent,
  ResponseFingerprint,
  ResponseDelta,
  ScoreVector,
  MutationResult,
  RoutingDecision,
  ObstacleClassification,
  AttemptRecord
} from '../types/pivot.js';

import { BaselineCapturer } from './baseline/BaselineCapturer.js';
import { ResponseDeltaCalculator } from './baseline/ResponseDelta.js';
import { AnomalyBuffer } from './baseline/AnomalyBuffer.js';
import { SignalRuleRegistry } from './scoring/SignalRuleRegistry.js';
import { DeterministicScorer } from './scoring/DeterministicScorer.js';
import { HttpExecutor, RequestOptions, ExecutionResult } from './http/HttpExecutor.js';
import { EncodingMutator, EncodingVariant } from './mutation/EncodingMutator.js';
import { StructuralMutator, StructuralVariant } from './mutation/StructuralMutator.js';
import { TimingMutator, TimingVariant } from './mutation/TimingMutator.js';
import { ProtocolMutator, ProtocolVariant } from './mutation/ProtocolMutator.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface PatternSignature {
  id: string;
  patterns: string[];
  class: ObstacleClassification;
  confidence: number;
  laneRecommendation: 'deterministic' | 'freestyle' | 'hybrid';
}

interface MutationPlan {
  family: 'encoding' | 'structural' | 'timing' | 'protocol';
  variant: string;
  payload: string;
  requestOptions: RequestOptions;
  targetUrl: string;
}

export interface PivotEngineConfig {
  maxDeterministicAttempts: number;
  freestyleEnabled: boolean;
  hybridThreshold: number;
  auditLogging: boolean;
  auditLogPath: string;
  requestTimeout: number;
  baselineSamples: number;
}

const DEFAULT_CONFIG: PivotEngineConfig = {
  maxDeterministicAttempts: 12,
  freestyleEnabled: true,
  hybridThreshold: 0.6,
  auditLogging: true,
  auditLogPath: './audit-logs',
  requestTimeout: 10000,
  baselineSamples: 5
};

export class PivotEngineWired {
  private config: PivotEngineConfig;

  // Phase 1
  private baselineCapturer: BaselineCapturer;
  private deltaCalculator: ResponseDeltaCalculator;
  private anomalyBuffer: AnomalyBuffer;

  // Phase 2
  private signalRuleRegistry: SignalRuleRegistry;
  private deterministicScorer: DeterministicScorer;

  // Phase 3
  private encodingMutator: EncodingMutator;
  private structuralMutator: StructuralMutator;
  private timingMutator: TimingMutator;
  private protocolMutator: ProtocolMutator;

  // HTTP layer
  private httpExecutor: HttpExecutor;

  // Phase 4 — pattern library
  private patternSignatures: Map<string, PatternSignature>;

  // Phase 5 — routing weights (updated between engagements)
  private routingWeights: Map<string, number>;

  // Runtime state — routing history per session
  private routingHistory: Array<{
    timestamp: string;
    engagementId: string;
    obstacleId: string;
    decision: RoutingDecision;
    outcome: 'exploited' | 'progressing' | 'abandoned' | 'escalated';
    scoreVector: ScoreVector;
  }> = [];

  // Freestyle log for Phase 7 review
  private freestyleLog: Array<{
    engagementId: string;
    obstacleId: string;
    suggestion: any;
    scoreAfter: number;
    success: boolean;
  }> = [];

  constructor(config: Partial<PivotEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.httpExecutor = new HttpExecutor(this.config.requestTimeout);
    this.baselineCapturer = new BaselineCapturer();
    this.deltaCalculator = new ResponseDeltaCalculator();
    this.anomalyBuffer = new AnomalyBuffer({
      storagePath: join(this.config.auditLogPath, 'anomalies')
    });
    this.signalRuleRegistry = new SignalRuleRegistry();
    this.deterministicScorer = new DeterministicScorer(this.signalRuleRegistry);
    this.encodingMutator = new EncodingMutator();
    this.structuralMutator = new StructuralMutator();
    this.timingMutator = new TimingMutator();
    this.protocolMutator = new ProtocolMutator();
    this.patternSignatures = this.buildDefaultPatternSignatures();
    this.routingWeights = this.buildDefaultRoutingWeights();

    if (this.config.auditLogging) {
      this.ensureAuditDir();
    }

    console.log('[PIVOT] Engine initialized. All mutation families loaded. HTTP executor ready.');
  }

  // ─── Main Entry Point ────────────────────────────────────────────────────

  /**
   * Process an obstacle event — the single entry point for all agents
   */
  async processObstacle(event: ObstacleEvent): Promise<MutationResult> {
    console.log(`[PIVOT] ObstacleEvent received: ${event.obstacle_id} (${event.phase})`);

    // 1. Pattern match terminal output
    const patternMatches = this.matchPatterns(event.terminal_output);

    // 2. Route
    const routingDecision = this.route(patternMatches, event);
    console.log(`[PIVOT] Routing → ${routingDecision.lane} (${routingDecision.confidence.toFixed(2)}) — ${routingDecision.reasoning}`);

    // 3. Execute lane
    let result: MutationResult;

    switch (routingDecision.lane) {
      case 'deterministic':
        result = await this.runDeterministicLane(event, routingDecision);
        break;
      case 'freestyle':
        result = await this.runFreestyleLane(event, routingDecision);
        break;
      case 'hybrid':
        result = await this.runHybridLane(event, routingDecision);
        break;
      default:
        result = this.makeAbandonResult(event, 'no_viable_lane');
    }

    // 4. Log
    this.logRoutingDecision(event, routingDecision, result);

    // 5. Write audit trace
    if (this.config.auditLogging) {
      this.writeAuditEntry(event, routingDecision, result);
    }

    return result;
  }

  // ─── Phase 4: Pattern Matching ────────────────────────────────────────────

  private matchPatterns(terminalOutput: string): Array<{ sig: PatternSignature; confidence: number }> {
    const matches: Array<{ sig: PatternSignature; confidence: number }> = [];

    if (!terminalOutput || terminalOutput.trim() === '') {
      const emptySig = this.patternSignatures.get('EMPTY_RESPONSE');
      if (emptySig) matches.push({ sig: emptySig, confidence: emptySig.confidence });
      return matches;
    }

    const lower = terminalOutput.toLowerCase();

    for (const sig of this.patternSignatures.values()) {
      const matchCount = sig.patterns.filter(p => lower.includes(p.toLowerCase())).length;
      if (matchCount > 0) {
        // Multiple pattern matches increase confidence
        const confidence = Math.min(sig.confidence + (matchCount - 1) * 0.05, 1.0);
        matches.push({ sig, confidence });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  // ─── Phase 5: Intelligent Router ─────────────────────────────────────────

  private route(
    matches: Array<{ sig: PatternSignature; confidence: number }>,
    event: ObstacleEvent
  ): RoutingDecision {
    // No match → freestyle with human review
    if (matches.length === 0) {
      return {
        lane: 'freestyle',
        confidence: 0.1,
        matched_pattern: null,
        classification: 'UNKNOWN',
        reasoning: 'No pattern signatures matched terminal output',
        fallback_eligible: true
      };
    }

    const top = matches[0];
    const storedWeight = this.routingWeights.get(top.sig.id) ?? top.sig.confidence;
    const weightedConf = top.confidence * storedWeight;

    // Check confidence decay — if decaying on current family, downgrade to hybrid
    const decayStatus = this.deterministicScorer.getConfidenceDecayStatus(
      top.sig.class,
      event.engagement_id
    );

    let lane: 'deterministic' | 'freestyle' | 'hybrid';

    if (weightedConf > 0.75 && !decayStatus.decayDetected) {
      lane = 'deterministic';
    } else if (weightedConf < 0.40) {
      lane = 'freestyle';
    } else {
      lane = 'hybrid';
    }

    const decayNote = decayStatus.decayDetected ? ' [decay detected → hybrid]' : '';

    return {
      lane,
      confidence: weightedConf,
      matched_pattern: top.sig.id,
      classification: top.sig.class,
      reasoning: `${top.sig.id} (weighted: ${weightedConf.toFixed(2)})${decayNote}`,
      fallback_eligible: lane !== 'deterministic'
    };
  }

  // ─── Phase 2+3: Deterministic Lane ───────────────────────────────────────

  private async runDeterministicLane(
    event: ObstacleEvent,
    routing: RoutingDecision
  ): Promise<MutationResult> {
    // Get or capture baseline
    let baseline = this.baselineCapturer.getBaseline(event.engagement_id);
    let baselineStats = this.baselineCapturer.getBaselineStats(event.engagement_id);

    if (!baseline && event.target_url) {
      console.log(`[PIVOT] Capturing baseline for ${event.engagement_id}...`);
      const { fingerprints, stats } = await this.httpExecutor.captureBaseline(
        event.target_url,
        {},
        this.config.baselineSamples
      );
      baseline = fingerprints[fingerprints.length - 1]; // use last as reference
      baselineStats = stats;
      this.baselineCapturer.storeBaseline(event.engagement_id, fingerprints, stats);
    }

    // Build mutation plans for this classification
    const plans = this.buildMutationPlans(event, routing.classification);

    let bestScore = 0;
    let bestResult: MutationResult | null = null;

    for (const plan of plans) {
      if (this.deterministicScorer.shouldAbandon(event.obstacle_id, event.engagement_id)) {
        console.log(`[PIVOT] Abandon threshold reached for ${event.obstacle_id}`);
        break;
      }

      console.log(`[PIVOT] Attempting: ${plan.family}::${plan.variant}`);

      // Execute real HTTP request
      let execResult: ExecutionResult;
      try {
        execResult = await this.httpExecutor.executeRequest(
          plan.targetUrl,
          plan.requestOptions,
          plan.payload
        );
      } catch (err: any) {
        console.error(`[PIVOT] Request failed: ${err.message}`);
        continue;
      }

      if (!baseline) {
        // First response becomes the baseline if we couldn't capture one
        baseline = execResult.fingerprint;
        continue;
      }

      // Compute real delta
      const delta = this.deltaCalculator.calculateDelta(
        baseline,
        execResult.fingerprint,
        baselineStats ?? undefined,
        plan.payload
      );

      // Score it
      const scoreVector = this.deterministicScorer.evaluateDelta(
        delta,
        event.obstacle_id,
        event.engagement_id,
        `${plan.family}::${plan.variant}`
      );

      console.log(`[PIVOT] Score: ${this.deterministicScorer.getScoreSummary(scoreVector)}`);

      // Log anomalies
      if (this.deltaCalculator.hasAnyChange(delta)) {
        this.anomalyBuffer.addDelta(
          event.engagement_id,
          delta,
          this.deltaCalculator.calculateConfidenceScore(delta),
          this.deltaCalculator.getChangeSummary(delta),
          {
            mutation_strategy: `${plan.family}::${plan.variant}`,
            payload: plan.payload,
            target_url: plan.targetUrl,
            obstacle_id: event.obstacle_id
          }
        );
      }

      // Exploit confirmed — stop immediately
      if (this.deterministicScorer.isExploitConfirmed(scoreVector.weighted_total)) {
        console.log(`[PIVOT] ✓ Exploit confirmed for ${event.obstacle_id}`);
        return {
          strategy_used: `${plan.family}::${plan.variant}`,
          lane_routed: 'deterministic',
          payload: plan.payload,
          confidence: routing.confidence,
          score_vector: scoreVector,
          next_steps: ['document_exploit', 'generate_poc'],
          abandon: false,
          human_review_flag: false,
          trace_id: this.makeTraceId(event)
        };
      }

      if (scoreVector.weighted_total > bestScore) {
        bestScore = scoreVector.weighted_total;
        bestResult = {
          strategy_used: `${plan.family}::${plan.variant}`,
          lane_routed: 'deterministic',
          payload: plan.payload,
          confidence: routing.confidence,
          score_vector: scoreVector,
          next_steps: this.deterministicScorer.isMakingProgress(scoreVector.weighted_total)
            ? ['continue_current_family']
            : ['try_next_family'],
          abandon: false,
          human_review_flag: false,
          trace_id: this.makeTraceId(event)
        };
      }
    }

    // Exhausted all plans
    if (bestResult && this.deterministicScorer.isMakingProgress(bestScore)) {
      bestResult.next_steps = ['escalate_to_hybrid'];
      return bestResult;
    }

    return this.makeAbandonResult(event, 'deterministic_exhausted');
  }

  // ─── Phase 6: Freestyle Lane ──────────────────────────────────────────────

  private async runFreestyleLane(
    event: ObstacleEvent,
    routing: RoutingDecision
  ): Promise<MutationResult> {
    console.log(`[PIVOT] Freestyle lane for ${event.obstacle_id}`);

    // Build a constrained brief for the LLM
    const brief = {
      obstacle_classification: routing.classification,
      phase: event.phase,
      terminal_output_excerpt: event.terminal_output.substring(0, 800),
      attempted_mutations: event.attempt_history
        .slice(-5)
        .map((a: AttemptRecord) => a.strategy),
      available_families: ['encoding', 'structural', 'timing', 'protocol']
    };

    // LLM call — constrained prompt, JSON-only output
    let suggestion: {
      strategy: string;
      mutation_family: string;
      payload_template: string;
      rationale: string;
    };

    try {
      suggestion = await this.callFreestyleLLM(brief);
    } catch (err: any) {
      console.error(`[PIVOT] Freestyle LLM failed: ${err.message}`);
      // Structured fallback — don't silently fail
      return {
        strategy_used: 'freestyle_llm_failure',
        lane_routed: 'freestyle',
        payload: '',
        confidence: 0,
        score_vector: this.zeroScoreVector(),
        next_steps: ['human_review_required'],
        abandon: true,
        human_review_flag: true,
        trace_id: this.makeTraceId(event)
      };
    }

    // Execute the suggestion and score it deterministically
    const basePayload = event.attempt_history.length > 0
      ? (event.attempt_history[event.attempt_history.length - 1] as AttemptRecord).payload || 'test'
      : 'test';

    const resolvedPayload = suggestion.payload_template.replace('{{payload}}', basePayload);

    // Log for Phase 7 review
    this.freestyleLog.push({
      engagementId: event.engagement_id,
      obstacleId: event.obstacle_id,
      suggestion,
      scoreAfter: 0, // will be updated
      success: false
    });

    return {
      strategy_used: suggestion.strategy,
      lane_routed: 'freestyle',
      payload: resolvedPayload,
      confidence: routing.confidence * 0.7,
      score_vector: this.zeroScoreVector(),
      next_steps: ['validate_with_deterministic_scoring'],
      abandon: false,
      human_review_flag: routing.confidence < 0.3,
      trace_id: this.makeTraceId(event)
    };
  }

  // ─── Hybrid Lane ──────────────────────────────────────────────────────────

  private async runHybridLane(
    event: ObstacleEvent,
    routing: RoutingDecision
  ): Promise<MutationResult> {
    console.log(`[PIVOT] Hybrid lane for ${event.obstacle_id}`);

    // Try deterministic first with reduced attempt budget
    const deterministicResult = await this.runDeterministicLane(event, routing);

    if (!deterministicResult.abandon && !deterministicResult.human_review_flag) {
      return { ...deterministicResult, lane_routed: 'hybrid' };
    }

    // Deterministic stalled — pass to freestyle with the failure context
    console.log(`[PIVOT] Deterministic stalled in hybrid, escalating to freestyle...`);

    const enrichedEvent: ObstacleEvent = {
      ...event,
      attempt_history: [
        ...event.attempt_history,
        {
          strategy: deterministicResult.strategy_used,
          payload: deterministicResult.payload,
          score: deterministicResult.score_vector.weighted_total,
          outcome: 'stalled'
        } as AttemptRecord
      ]
    };

    const freestyleResult = await this.runFreestyleLane(en