import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyMode } from '../dist/tools/policy.mode.js';
import { resolveToolProfile } from '../dist/policy/toolProfile.js';

test('readonly profile cannot advertise memory writes or proposal execution', () => {
 const s=buildPolicyMode({agentMode:'draft', toolProfile:resolveToolProfile('chatgpt_readonly')});
 assert.ok(s.allowed_capabilities.includes('memory.status'));
 assert.ok(s.blocked_capabilities.includes('nyxa_propose_action'));
 assert.ok(s.blocked_capabilities.includes('nyxa_memory_store_candidate'));
 assert.match(s.scope,/preflight only/);
});
test('unknown profile fails closed and observe_only blocks candidate write policy', () => {
 const closed=buildPolicyMode({agentMode:'draft',toolProfile:resolveToolProfile('unknown')});
 assert.equal(closed.allowed_capabilities.length,0);
 const observed=buildPolicyMode({agentMode:'observe_only',toolProfile:resolveToolProfile('')});
 assert.equal(observed.tools.find(t=>t.tool==='nyxa_memory_store_candidate').reason,'mode_below_minimum');
});
test('governed execute exposes proposal entry point without granting direct I2 authority', () => {
 const s=buildPolicyMode({agentMode:'draft',toolProfile:resolveToolProfile('chatgpt_governed_execute')});
 assert.ok(s.allowed_capabilities.includes('nyxa_propose_action'));
 assert.ok(s.blocked_capabilities.includes('nyxa_self_model_write_identity'));
});
