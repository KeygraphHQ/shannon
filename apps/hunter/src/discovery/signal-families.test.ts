import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundFamilyContributions, FAMILY_CONTRIBUTION_BUDGET, type SIGNAL_FAMILY } from './signal-families.js';

function component(key: keyof typeof SIGNAL_FAMILY, contribution: number) {
  return { key, contribution };
}

test('a single-member family is never scaled', () => {
  const result = boundFamilyContributions([component('bountyAttractiveness', 5)]);
  assert.equal(result[0]?.contribution, 5);
});

test('an uncorrelated pair of families (bountyEconomics + capabilityFit) is never scaled, however large', () => {
  const result = boundFamilyContributions([component('bountyAttractiveness', 10), component('capabilityFit', 10)]);
  assert.equal(result[0]?.contribution, 10);
  assert.equal(result[1]?.contribution, 10);
});

test('the correlated disclosureHistory family is scaled down once its combined |contribution| exceeds the budget', () => {
  const result = boundFamilyContributions([component('disclosedReportDensity', 1), component('vulnClassHistory', 1)]);
  const combined = result.reduce((sum, c) => sum + Math.abs(c.contribution), 0);
  assert.ok(combined <= FAMILY_CONTRIBUTION_BUDGET + 1e-9, `combined ${combined} exceeds the budget`);
});

test("scaling preserves each member's relative direction and proportion within the family", () => {
  const result = boundFamilyContributions([component('disclosedReportDensity', 2), component('vulnClassHistory', -1)]);
  const density = result.find((c) => c.key === 'disclosedReportDensity');
  const vulnClass = result.find((c) => c.key === 'vulnClassHistory');
  assert.ok(density && vulnClass);
  // ratio preserved: density was 2x the (absolute) size of vulnClass before scaling
  assert.ok(Math.abs(Math.abs(density.contribution) - 2 * Math.abs(vulnClass.contribution)) < 1e-9);
  assert.ok(density.contribution > 0, 'sign preserved for density');
  assert.ok(vulnClass.contribution < 0, 'sign preserved for vulnClass');
});

test('a family already under budget is left untouched', () => {
  const result = boundFamilyContributions([
    component('disclosedReportDensity', 0.1),
    component('vulnClassHistory', 0.1),
  ]);
  assert.equal(result[0]?.contribution, 0.1);
  assert.equal(result[1]?.contribution, 0.1);
});

test('original component ordering is preserved regardless of family grouping', () => {
  const result = boundFamilyContributions([
    component('capabilityFit', 1),
    component('disclosedReportDensity', 1),
    component('bountyAttractiveness', 1),
    component('vulnClassHistory', 1),
  ]);
  assert.deepEqual(
    result.map((c) => c.key),
    ['capabilityFit', 'disclosedReportDensity', 'bountyAttractiveness', 'vulnClassHistory'],
  );
});

test("three correlated signals cannot out-vote two independent ones: family cap keeps disclosureHistory bounded to roughly one independent signal's worth", () => {
  // Three strongly-positive correlated signals vs. one strongly-negative independent one.
  const correlated = boundFamilyContributions([
    component('competitionPressure', 1), // competition is its own family, NOT bounded with the other two
    component('disclosedReportDensity', 1),
    component('vulnClassHistory', 1),
  ]);
  const disclosureSum = correlated
    .filter((c) => c.key === 'disclosedReportDensity' || c.key === 'vulnClassHistory')
    .reduce((sum, c) => sum + c.contribution, 0);
  assert.ok(disclosureSum <= FAMILY_CONTRIBUTION_BUDGET + 1e-9);
  // competitionPressure, being its own family, is untouched
  assert.equal(correlated.find((c) => c.key === 'competitionPressure')?.contribution, 1);
});
