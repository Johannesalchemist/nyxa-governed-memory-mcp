import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKernelEffectEnvelope } from '../dist/governance/kernelContract.js';

const proposal = { actor:'agent:test', action:'x', target:'scratch:/x', scope:'test', reason:'test', provenance:{ taskId:'t', source:'test' } };

test('kernel contract fails closed for unknown action policy', () => {
  assert.deepEqual(buildKernelEffectEnvelope(proposal, undefined), { allowed:false, reason:'kernel_unknown_action_policy' });
});

test('I0 becomes read effect without authority requirement', () => {
  const r=buildKernelEffectEnvelope(proposal,{ capabilityClass:'I0', writesAuthoritativeMemory:false });
  assert.equal(r.allowed,true); assert.equal(r.envelope.effectClass,'read'); assert.equal(r.envelope.authorityRequired,false); assert.equal(r.envelope.verification,'none');
});

test('I1 becomes reversible effect requiring receipt verification', () => {
  const r=buildKernelEffectEnvelope(proposal,{ capabilityClass:'I1', writesAuthoritativeMemory:false });
  assert.equal(r.allowed,true); assert.equal(r.envelope.effectClass,'reversible'); assert.equal(r.envelope.authorityRequired,true); assert.equal(r.envelope.verification,'receipt');
});

test('I2/I3 become irreversible effects requiring independent verification', () => {
  for (const capabilityClass of ['I2','I3']) { const r=buildKernelEffectEnvelope(proposal,{ capabilityClass, writesAuthoritativeMemory:true }); assert.equal(r.allowed,true); assert.equal(r.envelope.effectClass,'irreversible'); assert.equal(r.envelope.authorityRequired,true); assert.equal(r.envelope.verification,'independent'); }
});

import { enforcePolicy } from '../dist/policy/enforcePolicy.js';
test('Kernel V1 invariant: all direct effect classes fail closed', () => {
  for (const name of ['nyxa_run_test','nyxa_apply_patch','nyxa_memory_store_candidate']) {
    const d=enforcePolicy(name,'draft'); assert.equal(d.allowed,false,name); assert.equal(d.reason,'effect_requires_kernel_dispatch',name);
  }
});
test('Kernel V1 invariant: direct I0 reads remain callable', () => {
  const d=enforcePolicy('nyxa_read_file','draft'); assert.equal(d.allowed,true); assert.equal(d.policy.capabilityClass,'I0');
});
