import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateActionProposal, validateHypothesisProposal } from './schema.js';

function validProposal(): unknown {
  return {
    kind: 'shannon',
    targetRef: 'https://app.example.com/search',
    hypothesisId: 'hyp-1',
    whyThisAction: 'Shannon can confirm the DOM XSS sink with source-aware analysis.',
    hypothesisTested: 'xss on /search',
    uncertaintyReduced: 'whether the sink is actually reachable with attacker input',
    confirmingObservation: 'a verified Shannon finding for this endpoint',
    contradictingObservation: 'Shannon reports the input is sanitized',
    nextStepIfConfirmed: 'proceed toward validation',
    nextStepIfContradicted: 'mark the hypothesis contradicted',
  };
}

test('validateActionProposal accepts a well-formed proposal', () => {
  const result = validateActionProposal(validProposal());
  assert.equal(result.ok, true);
});

test('validateActionProposal rejects a non-object', () => {
  assert.equal(validateActionProposal('not an object').ok, false);
  assert.equal(validateActionProposal(null).ok, false);
});

test('validateActionProposal rejects an invalid "kind"', () => {
  const result = validateActionProposal({ ...(validProposal() as object), kind: 'delete-everything' });
  assert.equal(result.ok, false);
});

test('validateActionProposal rejects a missing required string field', () => {
  const proposal = validProposal() as Record<string, unknown>;
  delete proposal.whyThisAction;
  const result = validateActionProposal(proposal);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /whyThisAction/);
});

test('validateActionProposal rejects an empty-string field', () => {
  const result = validateActionProposal({ ...(validProposal() as object), targetRef: '   ' });
  assert.equal(result.ok, false);
});

function validHypothesis(): unknown {
  return {
    statement: 'xss may be present on /search',
    vulnClass: 'xss',
    assetRef: 'https://app.example.com/search',
    potentialImpact: 'medium',
    confidence: 0.5,
    informationGain: 0.4,
    requiredEvidence: ['reproduction'],
    nextInvestigation: 'run Shannon',
    supportingObservationIds: ['obs-1'],
  };
}

test('validateHypothesisProposal accepts a well-formed proposal', () => {
  assert.equal(validateHypothesisProposal(validHypothesis()).ok, true);
});

test('validateHypothesisProposal rejects an out-of-range confidence', () => {
  const result = validateHypothesisProposal({ ...(validHypothesis() as object), confidence: 1.5 });
  assert.equal(result.ok, false);
});

test('validateHypothesisProposal rejects an invalid potentialImpact', () => {
  const result = validateHypothesisProposal({ ...(validHypothesis() as object), potentialImpact: 'catastrophic' });
  assert.equal(result.ok, false);
});

test('validateHypothesisProposal rejects a non-array requiredEvidence', () => {
  const result = validateHypothesisProposal({ ...(validHypothesis() as object), requiredEvidence: 'reproduction' });
  assert.equal(result.ok, false);
});
