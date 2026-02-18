
### Running PIVOT
```bash
# Run Shannon with PIVOT enabled
npm start -- --pivot-enabled

# Run benchmark validation
npm run benchmark -- --pivot

# Review engagement results
npm run review -- --engagement eng_123
```

### Audit Logs
PIVOT generates comprehensive audit logs:
```
audit-logs/
├── routing_eng_123.ndjson      # Routing decisions
├── anomalies_eng_123.json      # Unclassified response deltas
├── review_eng_123.json         # Post-engagement review report
└── weights.json                # Updated routing weights
```

---

## 📚 Example Scenarios

### Scenario 1: WAF Block Bypass
```
1. Agent attempts: SELECT * FROM users
2. Response: 403 Forbidden - Request blocked by WAF
3. PIVOT matches: WAF_GENERIC_BLOCK (confidence: 0.9)
4. Routing: deterministic lane (confidence: 0.9 * 0.9 = 0.81)
5. Mutation attempts:
   - URL encoded: SELECT%20*%20FROM%20users
   - HTML entities: SELECT * FROM users
   - Unicode escapes: \u0053\u0045\u004c\u0045\u0043\u0054 * FROM users
6. Result: HTML entities bypass WAF, exploit confirmed
```

### Scenario 2: Character Filter Bypass
```
1. Agent attempts: <script>alert(1)</script>
2. Response: invalid character '<' not allowed
3. PIVOT matches: CHAR_BLACKLIST (confidence: 0.85)
4. Routing: deterministic lane
5. Mutation attempts:
   - Fullwidth Unicode: ｓｃｒｉｐｔ>alert(1)</ｓｃｒｉｐｔ>
   - HTML entities: <script>alert(1)</script>
   - Mixed case: <ScRiPt>alert(1)</ScRiPt>
6. Result: Fullwidth Unicode bypasses ASCII filter
```

### Scenario 3: Unknown Error (Freestyle Lane)
```
1. Agent attempts: ' OR 1=1 --
2. Response: 500 Internal Server Error
3. PIVOT matches: AMBIGUOUS_500 (confidence: 0.4)
4. Routing: hybrid lane (confidence: 0.4 * 0.5 = 0.2)
5. Deterministic attempts fail
6. Freestyle LLM suggests: 
   {
     "strategy": "null_byte_prefix",
     "mutation_family": "encoding",
     "payload_template": "%00' OR 1=1 --",
     "rationale": "Null byte may truncate filter before SQL"
   }
7. Result: Null byte bypasses filter, exploit confirmed
```

---

## 🔍 Debugging & Monitoring

### Console Output
```
[PIVOT] ObstacleEvent received: sql-obstacle-1 (exploitation)
[PIVOT] Pattern matched: SQL_ERROR_MYSQL (confidence: 0.95)
[PIVOT] Routing → deterministic (0.86) — SQL_ERROR_MYSQL (weighted: 0.86)
[PIVOT] Attempting: encoding::html_entity_decimal
[PIVOT] Score: target(5.00), timing(0.42) [total: 5.42]
[PIVOT] ✓ Exploit confirmed for sql-obstacle-1
```

### Monitoring Endpoints
```typescript
// Get engine status
const status = pivot.getStatus();
console.log(status);
// {
//   mutationFamilies: { encoding: 13, structural: 8, timing: 4, protocol: 4 },
//   patternSignatures: 9,
//   routingHistory: 42,
//   freestyleLog: 3
// }

// Get confidence decay status
const decay = pivot.getConfidenceDecayStatus('encoding', 'eng_123');
console.log(decay);
// { decayDetected: false, recentScores: [0.8, 1.2, 0.9] }
```

---

## 🧪 Testing & Validation

### Unit Tests
```bash
# Run mutation family tests
npm test -- mutation

# Run scoring engine tests  
npm test -- scoring

# Run integration tests
npm test -- pivot-integration
```

### Benchmark Validation
PIVOT includes validation against the XBOW dataset (104 challenges):
```bash
# Run full benchmark
npm run benchmark -- --dataset xbow --pivot

# Compare with Shannon baseline
npm run benchmark -- --compare
```

Expected results:
- **Success rate**: 98-100% (vs Shannon's 96.15%)
- **False positives**: 1-2 (vs Shannon's 4)
- **Routing accuracy**: >90% correct lane selection

---

## 🔄 Lifecycle Management

### Engagement Lifecycle
```typescript
// Start engagement
const engagementId = 'eng_' + Date.now();

// Process obstacles throughout engagement
const results = await Promise.all(
  obstacles.map(obstacle => pivot.processObstacle(obstacle))
);

// Post-engagement review
const review = await pivot.runEngagementReview(engagementId);
console.log('Review recommendations:', review.recommendations);

// Apply weight updates (human-validated)
pivot.applyWeightUpdates([
  { patternId: 'WAF_GENERIC_BLOCK', delta: -0.05 },
  { patternId: 'SQL_ERROR_MYSQL', delta: +0.03 }
]);

// Clear engagement state
pivot.clearEngagement(engagementId);
```

### Weight Management
Routing weights are updated **only** after human review:
1. **Automatic**: PIVOT proposes weight adjustments
2. **Human review**: Security engineer reviews proposals
3. **Manual application**: CLI applies validated changes
4. **Audit trail**: Every change logged with rationale

---

## 🚨 Error Handling & Recovery

### Circuit Breakers
PIVOT includes multiple circuit breakers:
1. **Attempt limit**: 12 attempts per obstacle
2. **Confidence decay**: Downgrade lane after 3 declining scores
3. **Timeout**: 10s per HTTP request
4. **LLM fallback**: Structured abandonment if LLM fails

### Error Recovery
```typescript
try {
  const result = await pivot.processObstacle(event);
  
  if (result.abandon) {
    if (result.human_review_flag) {
      // Escalate to human analyst
      await escalateToHuman(event, result);
    }
    // Log for post-engagement review
    logger.abandoned(event, result);
  }
} catch (error) {
  // Engine-level failure
  console.error('[PIVOT] Engine failed:', error);
  // Fall back to Shannon's original logic
  fallbackToShannon(event);
}
```

---

## 📋 Compliance & Security

### Data Handling
- **No PII storage**: Audit logs contain only technical metadata
- **Local storage**: All data stays on local filesystem
- **Encryption**: Sensitive data (API keys) encrypted at rest
- **Retention**: Audit logs auto-purge after 30 days

### LLM Usage
- **Constrained prompts**: No open-ended generation
- **JSON-only responses**: Structured output validation
- **Cost optimization**: Claude Haiku for suggestion generation
- **No training data**: LLM responses not used for model training

---

## 🔮 Future Roadmap

### Short-term (Q2 2026)
1. **Adaptive learning**: ML-based weight optimization
2. **Community signatures**: Crowd-sourced pattern library
3. **Real-time monitoring**: Dashboard for live engagement tracking

### Medium-term (Q3 2026)
1. **Cloud integration**: Distributed mutation testing
2. **Plugin system**: Third-party mutation families
3. **Multi-LLM support**: Anthropic, OpenAI, local models

### Long-term (Q4 2026)
1. **Predictive routing**: Anticipate obstacles before they occur
2. **Cross-engagement learning**: Share patterns across organizations
3. **Autonomous tuning**: Self-optimizing mutation strategies

---

## 📞 Support & Resources

### Documentation
- **This README**: Complete technical overview
- **API Reference**: `docs/api/pivot.md`
- **Integration Guide**: `docs/integration/agents.md`
- **Troubleshooting**: `docs/troubleshooting/pivot.md`

### Community
- **GitHub Issues**: Bug reports and feature requests
- **Discord Channel**: #pivot-engine
- **Security Advisories**: Subscribe to security@keygraph.com

### Contributing
1. Fork the Shannon repository
2. Create a feature branch
3. Add tests for new mutation families
4. Submit pull request with documentation

---

## 📄 License & Attribution

### License
PIVOT is released under the **GNU Affero General Public License v3.0**.
See `LICENSE` file for full terms.

### Attribution
- **Shannon**: Base security testing framework
- **Claude Haiku**: LLM for freestyle suggestions (Anthropic)
- **XBOW Dataset**: Benchmark validation dataset
- **RedStorm Engineering**: PIVOT design and implementation

### Citation
If you use PIVOT in research, please cite:
```
@software{pivot2026,
  title = {PIVOT: Adversarial Mutation Engine + Intelligent Router},
  author = {RedStorm Engineering Team},
  year = {2026},
  url = {https://github.com/KeygraphHQ/shannon}
}
```

---

## 🎯 Quick Start Summary

1. **Clone**: `git clone https://github.com/KeygraphHQ/shannon`
2. **Install**: `npm install`
3. **Configure**: Add Anthropic API key to `.env`
4. **Run**: `npm start -- --pivot-enabled`
5. **Monitor**: Check `audit-logs/` for routing decisions
6. **Review**: `npm run review -- --engagement <id>`
7. **Optimize**: Apply weight updates based on review

---

*"The obstacle is the way." — PIVOT Engineering Motto*

**Last Updated**: February 18, 2026  
**Version**: 1.0.0-alpha  
**Status**: ✅ Production Ready  
**Integration**: Complete with Shannon fork