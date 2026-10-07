import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLearningRatchet } from '../dist/organism/learningRatchet.js';

const baseline = {
  resistance: 5,
  legitimateCapability: 10,
  recoveryCost: 1,
  complexityCost: 1,
  authority: 0
};

const verified = {
  failureClass: 'hidden_operator',
  baseline,
  candidate: { ...baseline, resistance: 8 },
  originalAttackBlocked: true,
  variantAttackBlocked: true,
  regressionPassed: true,
  independentVerificationPassed: true
};

test('retains only a verified positive-growth repair', () => {
  const decision = evaluateLearningRatchet(verified);
  assert.equal(decision.outcome, 'RETAIN_CANDIDATE');
  assert.equal(decision.growth, 3);
  assert.equal(decision.authorityEffect, 'NONE');
  assert.deepEqual(decision.reasons, []);
});

test('rejects fake strengthening by disabling legitimate capability', () => {
  const decision = evaluateLearningRatchet({
    ...verified,
    candidate: { ...verified.candidate, resistance: 20, legitimateCapability: 9 }
  });
  assert.equal(decision.outcome, 'HOLD');
  assert.ok(decision.reasons.includes('legitimate_capability_loss'));
});

test('rejects learning that increases authority even when resistance improves', () => {
  const decision = evaluateLearningRatchet({
    ...verified,
    candidate: { ...verified.candidate, resistance: 20, authority: 1 }
  });
  assert.equal(decision.outcome, 'HOLD');
  assert.ok(decision.reasons.includes('authority_delta_rejected'));
  assert.equal(decision.authorityEffect, 'NONE');
});

test('rejects apparent resistance gain when recovery and complexity costs erase it', () => {
  const decision = evaluateLearningRatchet({
    ...verified,
    candidate: { ...verified.candidate, resistance: 9, recoveryCost: 3, complexityCost: 4 }
  });
  assert.equal(decision.growth, -1);
  assert.equal(decision.outcome, 'HOLD');
  assert.ok(decision.reasons.includes('no_positive_growth'));
});

test('requires the original attack and a variant to both be blocked', () => {
  const originalOpen = evaluateLearningRatchet({ ...verified, originalAttackBlocked: false });
  const variantOpen = evaluateLearningRatchet({ ...verified, variantAttackBlocked: false });
  assert.equal(originalOpen.outcome, 'HOLD');
  assert.equal(variantOpen.outcome, 'HOLD');
  assert.ok(originalOpen.reasons.includes('original_attack_not_blocked'));
  assert.ok(variantOpen.reasons.includes('variant_attack_not_blocked'));
});

test('fails closed on non-finite metrics', () => {
  const decision = evaluateLearningRatchet({
    ...verified,
    candidate: { ...verified.candidate, resistance: Number.POSITIVE_INFINITY }
  });
  assert.equal(decision.outcome, 'HOLD');
  assert.ok(decision.reasons.includes('non_finite_metric'));
});

test('fails closed when failure class is missing', () => {
  const decision = evaluateLearningRatchet({ ...verified, failureClass: '   ' });
  assert.equal(decision.outcome, 'HOLD');
  assert.ok(decision.reasons.includes('failure_class_missing'));
});
