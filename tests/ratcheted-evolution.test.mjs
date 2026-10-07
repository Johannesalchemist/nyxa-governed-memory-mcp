import test from 'node:test';
import assert from 'node:assert/strict';
import { gateRatchetedEvolution } from '../dist/organism/ratchetedEvolution.js';

const evolution = {
  decision: 'PROMOTE_MODEL_UPDATE',
  nextGenerationCandidate: 2,
  authorityEffect: 'NONE',
  reasons: []
};

test('ratchet can retain a nominated next generation', () => {
  const out = gateRatchetedEvolution(evolution, {
    outcome: 'RETAIN_CANDIDATE', growth: 1, authorityEffect: 'NONE', reasons: []
  });
  assert.equal(out.decision, 'PROMOTE_MODEL_UPDATE');
  assert.equal(out.nextGenerationCandidate, 2);
  assert.equal(out.authorityEffect, 'NONE');
});

test('ratchet HOLD blocks evolution promotion', () => {
  const out = gateRatchetedEvolution(evolution, {
    outcome: 'HOLD', growth: 0, authorityEffect: 'NONE', reasons: ['variant_attack_not_blocked']
  });
  assert.equal(out.decision, 'HOLD');
  assert.equal(out.nextGenerationCandidate, null);
  assert.ok(out.reasons.includes('learning_ratchet_hold'));
});

test('shadow-only cannot be promoted by a passing ratchet', () => {
  const out = gateRatchetedEvolution(
    { ...evolution, decision: 'SHADOW_ONLY', nextGenerationCandidate: null },
    { outcome: 'RETAIN_CANDIDATE', growth: 1, authorityEffect: 'NONE', reasons: [] }
  );
  assert.equal(out.decision, 'SHADOW_ONLY');
  assert.equal(out.nextGenerationCandidate, null);
});

test('promotion fails closed when nominated generation is absent', () => {
  const out = gateRatchetedEvolution(
    { ...evolution, nextGenerationCandidate: null },
    { outcome: 'RETAIN_CANDIDATE', growth: 1, authorityEffect: 'NONE', reasons: [] }
  );
  assert.equal(out.decision, 'HOLD');
  assert.equal(out.nextGenerationCandidate, null);
  assert.ok(out.reasons.includes('next_generation_candidate_missing'));
});
