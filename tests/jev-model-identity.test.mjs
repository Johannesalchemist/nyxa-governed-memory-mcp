import test from 'node:test';import assert from 'node:assert/strict';
import {JEV_CANONICAL_MODEL,JEV_COMPARISON_MODELS,assertCanonicalJevModel,jevModelPassport} from '../dist/organism/jevModelIdentity.js';
test('Jev canonical model is pinned to v21 revision',()=>{assert.equal(JEV_CANONICAL_MODEL.id,'StrandsAgents/strands-decider-2B-hobson-v21');assert.equal(JEV_CANONICAL_MODEL.parametersB,1.9);assert.equal(assertCanonicalJevModel(JEV_CANONICAL_MODEL.id,JEV_CANONICAL_MODEL.revision).role,'DECISION_MODEL')});
test('silent Jev model substitution fails closed',()=>{assert.throws(()=>assertCanonicalJevModel('qwen2.5-coder:7b',JEV_CANONICAL_MODEL.revision),/identity_mismatch/);assert.throws(()=>assertCanonicalJevModel(JEV_CANONICAL_MODEL.id,'latest'),/revision_mismatch/)});
test('7B stays comparison-only',()=>{assert.equal(JEV_COMPARISON_MODELS[0].role,'COMPARISON_ONLY');assert.equal(jevModelPassport().authorityEffect,'NONE')});
