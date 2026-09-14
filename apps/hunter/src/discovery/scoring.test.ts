import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainSelection, rankPrograms, scoreProgram, selectBestProgram } from './scoring.js';
import type { DiscoveredProgram, ProgramSignal } from './types.js';

function signal(
  value: number,
  confidence = 0.9,
  detail = 'test signal',
  freshnessAt = '2026-09-01T00:00:00.000Z',
): ProgramSignal {
  return { value, confidence, freshnessAt, detail };
}

function program(id: string, overrides: Partial<DiscoveredProgram> = {}): DiscoveredProgram {
  return {
    programId: id,
    programName: id,
    platform: 'hackerone',
    offersBounty: true,
    assets: [],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    signals: {},
    sourceProvider: 'test',
    discoveredAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-09-14T00:00:00.000Z').getTime();

test('a program with no signals at all scores undefined and never wins', () => {
  const empty = program('empty');
  const rich = program('rich', { signals: { bountyAttractiveness: signal(0.9) } });
  const ranked = rankPrograms([empty, rich], {}, NOW);
  assert.equal(ranked[0]?.program.programId, 'rich');
  assert.equal(scoreProgram(empty, {}, NOW).totalScore, undefined);
});

test('a higher-value signal produces a higher total score, all else equal', () => {
  const low = program('low', { signals: { bountyAttractiveness: signal(0.2), capabilityFit: signal(0.8) } });
  const high = program('high', { signals: { bountyAttractiveness: signal(0.9), capabilityFit: signal(0.8) } });
  const lowScore = scoreProgram(low, {}, NOW).totalScore as number;
  const highScore = scoreProgram(high, {}, NOW).totalScore as number;
  assert.ok(highScore > lowScore, `expected ${highScore} > ${lowScore}`);
});

test('a low-confidence signal contributes less than a high-confidence one of the same value', () => {
  const uncertain = program('uncertain', { signals: { bountyAttractiveness: signal(0.9, 0.1) } });
  const certain = program('certain', { signals: { bountyAttractiveness: signal(0.9, 0.95) } });
  const uncertainScore = scoreProgram(uncertain, {}, NOW).components[0];
  const certainScore = scoreProgram(certain, {}, NOW).components[0];
  assert.ok(uncertainScore && certainScore);
  assert.ok(uncertainScore.contribution < certainScore.contribution);
});

test('stale data shrinks toward the neutral prior (0.5) rather than being trusted at face value', () => {
  // A single very-positive (0.9) signal: fresh, it should score close to
  // 0.9. Stale, its freshness-decayed trust should pull the score back
  // toward 0.5 — never all the way to 0 (that would treat "old" as "bad",
  // which it is not; it is "uncertain"), and never left unaffected (which
  // is the bug this test guards against: with only one signal present,
  // confidence/freshness used to cancel out of the score's numerator and
  // denominator identically, so a wildly stale statistic scored exactly
  // like a fresh one).
  const fresh = program('fresh', {
    signals: { bountyAttractiveness: signal(0.9, 0.9, 'fresh', new Date(NOW).toISOString()) },
  });
  const stale = program('stale', {
    signals: { bountyAttractiveness: signal(0.9, 0.9, 'stale', new Date(NOW - 400 * 86_400_000).toISOString()) },
  });
  const freshScore = scoreProgram(fresh, {}, NOW).totalScore as number;
  const staleScore = scoreProgram(stale, {}, NOW).totalScore as number;
  assert.ok(staleScore < freshScore, `expected stale (${staleScore}) < fresh (${freshScore})`);
  assert.ok(
    staleScore > 0.5,
    'a positive stale signal should still pull the score above neutral, just less than a fresh one',
  );
  assert.ok(staleScore < 0.9, 'trust decay must visibly soften the raw value, not leave it untouched');
});

test('missing signals are reported and never defaulted', () => {
  const partial = program('partial', { signals: { bountyAttractiveness: signal(0.5) } });
  const score = scoreProgram(partial, {}, NOW);
  assert.ok(score.missingSignals.includes('competitionPressure'));
  assert.ok(score.missingSignals.includes('capabilityFit'));
  assert.equal(score.components.length, 1);
});

test('tie case: equal scores break by evidence weight, then by programId', () => {
  const a = program('b-program', { signals: { bountyAttractiveness: signal(0.5) } });
  const b = program('a-program', { signals: { bountyAttractiveness: signal(0.5) } });
  const ranked = rankPrograms([a, b], {}, NOW);
  // identical single-signal evidence weight -> alphabetical tiebreak
  assert.equal(ranked[0]?.program.programId, 'a-program');
  assert.equal(ranked[1]?.program.programId, 'b-program');
});

test('rankPrograms + selectBestProgram: high bounty but terrible competition can lose to medium bounty low competition', () => {
  const highBountyHighCompetition = program('crowded', {
    signals: {
      bountyAttractiveness: signal(0.95, 0.9, 'huge bounty'),
      competitionPressure: signal(0.05, 0.9, 'extremely crowded'),
      capabilityFit: signal(1, 0.9, 'web'),
    },
  });
  const mediumBountyLowCompetition = program('quiet', {
    signals: {
      bountyAttractiveness: signal(0.5, 0.9, 'medium bounty'),
      competitionPressure: signal(0.95, 0.9, 'almost no competition'),
      capabilityFit: signal(1, 0.9, 'web'),
    },
  });
  const ranked = rankPrograms([highBountyHighCompetition, mediumBountyLowCompetition], {}, NOW);
  const winner = selectBestProgram(ranked);
  assert.equal(winner?.program.programId, 'quiet');
});

test('changing the dataset changes the selected program', () => {
  const a = program('a', { signals: { bountyAttractiveness: signal(0.4) } });
  const b = program('b', { signals: { bountyAttractiveness: signal(0.6) } });
  const rankedBefore = rankPrograms([a, b], {}, NOW);
  assert.equal(selectBestProgram(rankedBefore)?.program.programId, 'b');

  const bWeakened = program('b', { signals: { bountyAttractiveness: signal(0.2) } });
  const rankedAfter = rankPrograms([a, bWeakened], {}, NOW);
  assert.equal(selectBestProgram(rankedAfter)?.program.programId, 'a');
});

test('explainSelection names the deciding signals', () => {
  const winner = program('winner', {
    programName: 'Winner Corp',
    signals: { bountyAttractiveness: signal(0.9, 0.9, 'high bounty'), capabilityFit: signal(1, 0.9, 'web app') },
  });
  const loser = program('loser', {
    programName: 'Loser Inc',
    signals: { bountyAttractiveness: signal(0.2, 0.9, 'low bounty'), capabilityFit: signal(1, 0.9, 'web app') },
  });
  const ranked = rankPrograms([winner, loser], {}, NOW);
  const explanation = explainSelection(ranked);
  assert.match(explanation, /Winner Corp/);
  assert.match(explanation, /Loser Inc/);
  assert.match(explanation, /bountyAttractiveness/);
});

test('explainSelection handles a single scorable candidate without throwing', () => {
  const onlyOne = program('only', { signals: { bountyAttractiveness: signal(0.5) } });
  const ranked = rankPrograms([onlyOne], {}, NOW);
  assert.doesNotThrow(() => explainSelection(ranked));
});

test('explainSelection handles zero scorable candidates without throwing', () => {
  const ranked = rankPrograms([program('none')], {}, NOW);
  assert.equal(explainSelection(ranked), 'no program had enough signal data to be selected');
});

test('custom weights change the ranking', () => {
  const bountyHeavy = program('bounty-heavy', {
    signals: { bountyAttractiveness: signal(0.9), capabilityFit: signal(0.1) },
  });
  const fitHeavy = program('fit-heavy', {
    signals: { bountyAttractiveness: signal(0.1), capabilityFit: signal(0.9) },
  });
  const defaultRanked = rankPrograms([bountyHeavy, fitHeavy], {}, NOW);
  assert.equal(defaultRanked[0]?.program.programId, 'bounty-heavy');

  const fitFocused = rankPrograms([bountyHeavy, fitHeavy], { bountyAttractiveness: 0.1, capabilityFit: 5 }, NOW);
  assert.equal(fitFocused[0]?.program.programId, 'fit-heavy');
});
