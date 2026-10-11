import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAblation,canTransition,validateResearchSource} from '../dist/research/frontierExperimentV1.js';
test('frontier research requires attributable primary-source metadata',()=>{
 const s={id:'doi:example',url:'https://university.example/thesis',title:'Thesis',kind:'dissertation',published:'2026-01-01',accessed:'2026-10-11',question:'What changes?',limitations:['Not replicated']};
 assert.equal(validateResearchSource(s),true);
 assert.equal(validateResearchSource({...s,url:'file:///etc/passwd'}),false);
 assert.equal(validateResearchSource({...s,kind:'established_truth'}),false);
});
test('ablation fails closed without independent review and governance',()=>{
 const a={experimentId:'a1',baseline:[1,2,3],candidate:[2,3,4],higherIsBetter:true,independentReview:'PENDING',gate:'ALLOW'};
 assert.equal(evaluateAblation(a).decision,'HOLD');
 assert.equal(evaluateAblation({...a,independentReview:'APPROVED',gate:'DENY'}).decision,'HOLD');
 assert.equal(evaluateAblation({...a,independentReview:'APPROVED'}).decision,'ELIGIBLE_FOR_AUTHORIZED_SANDBOX');
 assert.equal(evaluateAblation({...a,baseline:[1]}).decision,'HOLD');
 assert.equal(evaluateAblation({...a,candidate:[0,0,0],independentReview:'APPROVED'}).decision,'HOLD');
});
test('activation denies skipping gates and unapproved escalation',()=>{
 assert.equal(canTransition('OFF','ACTIVE','ALLOW',true),false);
 assert.equal(canTransition('OFF','SHADOW','DENY',true),false);
 assert.equal(canTransition('OFF','SHADOW','ALLOW',false),false);
 assert.equal(canTransition('OFF','SHADOW','ALLOW',true),true);
 assert.equal(canTransition('QUARANTINED','ACTIVE','ALLOW',true),false);
 assert.equal(canTransition('ACTIVE','QUARANTINED','DENY',false),true);
});
