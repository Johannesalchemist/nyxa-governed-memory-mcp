import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateJevWeightCandidate,compareJevArms} from '../dist/organism/jevWeightEvolution.js';

const base={id:'j2-v1',parentId:'jev-v0',arm:'J2_WEIGHT',experienceSetRef:'evidence://nyxa/e17',trainingRecipeRef:'recipe://r1',weightDeltaRef:'weights://delta/v1',passportLineageRef:'passport://jev/v1',unseenVariantPassed:true,independentVerificationPassed:true,eval:{diagnosis:.9,generalization:.8,prediction:.8,recovery:.9,falseIntervention:.1,capabilityLoss:0,calibrationError:.1,regression:0,authorityDrift:0}};

test('verified weight candidate may be retained without authority gain',()=>{
 const d=evaluateJevWeightCandidate(base);
 assert.equal(d.outcome,'RETAIN_CANDIDATE');
 assert.equal(d.authorityEffect,'NONE');
 assert.ok(d.score>0);
});

test('authority drift fails closed even with excellent task scores',()=>{
 const d=evaluateJevWeightCandidate({...base,eval:{...base.eval,diagnosis:1,generalization:1,authorityDrift:.01}});
 assert.equal(d.outcome,'HOLD');
 assert.ok(d.reasons.includes('authority_drift'));
});

test('weight candidate must generalize to an unseen variant',()=>{
 const d=evaluateJevWeightCandidate({...base,unseenVariantPassed:false});
 assert.equal(d.outcome,'HOLD');
 assert.ok(d.reasons.includes('unseen_variant_failed'));
});

test('independent verification is mandatory for retention',()=>{
 const d=evaluateJevWeightCandidate({...base,independentVerificationPassed:false});
 assert.equal(d.outcome,'HOLD');
});

test('retrieval arm remains shadow evidence, not a model promotion',()=>{
 const d=evaluateJevWeightCandidate({...base,id:'j1',arm:'J1_RETRIEVAL',weightDeltaRef:null});
 assert.equal(d.outcome,'SHADOW_ONLY');
});

test('comparison can rank four arms without converting score into authority',()=>{
 const arms=[
  {...base,id:'j0',arm:'J0_BASE',weightDeltaRef:null,eval:{...base.eval,diagnosis:.4,generalization:.3,prediction:.3,recovery:.4}},
  {...base,id:'j1',arm:'J1_RETRIEVAL',weightDeltaRef:null,eval:{...base.eval,diagnosis:.7,generalization:.6,prediction:.6,recovery:.7}},
  base,
  {...base,id:'j3',arm:'J3_WEIGHT_REFLECTIVE',weightDeltaRef:'weights://delta/v2',eval:{...base.eval,diagnosis:.95,generalization:.9,prediction:.9,recovery:.95}}
 ];
 const out=compareJevArms(arms);
 assert.equal(out.winner,'j3');
 assert.ok(out.evaluated.every(x=>x.decision.authorityEffect==='NONE'));
});
