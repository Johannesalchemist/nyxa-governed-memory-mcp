// ELM-001: deterministic integration contract, NOT proof of autonomous learning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchProviderRegistry, RoutedResearchProvider } from '../dist/epistemic/researchRouter.js';
import { evaluateLearningRatchet } from '../dist/organism/learningRatchet.js';
import { MockResearchProvider } from '../dist/epistemic/researchAgent.js';

const request = (i) => ({ claim_id:`elm-${i}`, statement: i%3===0?'__ESCALATES__':i%3===1?'__RESOLVES__':'__NO_GAIN__', evidence_packet:{claim_id:`elm-${i}`,statement:'synthetic',evidence_strength:0.2,provenance_quality:0.2} });
const registry = new ResearchProviderRegistry({jevProviderId:'jev-mock',externalProviderIds:['reviewer-a','reviewer-b']})
 .register({id:'jev-mock',provider:new MockResearchProvider(),external:false,modelVersion:'mock-v1'})
 .register({id:'reviewer-a',provider:new MockResearchProvider(),external:true})
 .register({id:'reviewer-b',provider:new MockResearchProvider(),external:true});
const local = new RoutedResearchProvider(registry,'LOCAL_JEV');
const independent = new RoutedResearchProvider(registry,'INDEPENDENT_CHECK');

test('ELM-001 routes 30 distinct synthetic research cases and 30 independent checks without authority', async()=>{
  for(let i=0;i<30;i++){
    const q=request(i); const [a,b]=await Promise.all([local.research(q),independent.research(q)]);
    assert.ok(a.provenance_refs.length>=1);
    assert.ok(b.provenance_refs.length>=2);
    assert.equal('authority' in a,false);
    assert.equal('authority' in b,false);
    assert.equal('action' in b,false);
  }
});

test('ELM-001 ratchet blocks unverified synthetic improvements',()=>{
 const base={resistance:5,legitimateCapability:10,recoveryCost:1,complexityCost:1,authority:0};
 const candidate={...base,resistance:7};
 const input={failureClass:'research_error',baseline:base,candidate,originalAttackBlocked:true,variantAttackBlocked:true,regressionPassed:true,independentVerificationPassed:false};
 assert.equal(evaluateLearningRatchet(input).outcome,'HOLD');
 assert.ok(evaluateLearningRatchet(input).reasons.includes('independent_verification_missing'));
 assert.equal(evaluateLearningRatchet({...input,independentVerificationPassed:true}).outcome,'RETAIN_CANDIDATE');
 assert.equal(evaluateLearningRatchet({...input,independentVerificationPassed:true,candidate:{...candidate,authority:1}}).outcome,'HOLD');
});
