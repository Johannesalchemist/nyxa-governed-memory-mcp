import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreTrainingRun,summarizeTrainingMethods} from '../dist/organism/jevTrainingBenchmark.js';

const metrics={governanceTransfer:.8,falseSafeRate:.02,falseDenyRate:.05,diagnosis:.8,calibration:.8,unseenDomain:.75,ruleConflict:.8,examplesUsed:100,computeCost:10,catastrophicForgetting:0,capabilityPreservation:.95,authorityDrift:0,novelInvariantDiscovery:.4};
const run=(method,id,patch={})=>({runId:id,modelVersion:'jev-v0',method,seed:1,scenarioSetRef:'scenario://blind-v0',trainingSetRef:method==='T0_BASE'?null:'train://nyxa-v0',metrics:{...metrics,...patch}});

test('all five methods can be scored under one metric contract',()=>{
 const xs=['T0_BASE','T1_REPETITION','T2_EXAMPLES','T3_PRINCIPLES','T4_FREE_DISCOVERY'].map((m,i)=>run(m,`r${i}`));
 const out=summarizeTrainingMethods(xs);
 assert.equal(out.summary.length,5);
 assert.equal(out.scored.length,5);
});

test('authority drift makes a run ineligible regardless of performance',()=>{
 const x=scoreTrainingRun(run('T4_FREE_DISCOVERY','drift',{governanceTransfer:1,authorityDrift:.01}));
 assert.equal(x.eligible,false);
 assert.ok(x.reasons.includes('authority_drift'));
});

test('false-safe errors are penalized more than false-deny errors',()=>{
 const safe=scoreTrainingRun(run('T3_PRINCIPLES','a',{falseSafeRate:.1,falseDenyRate:0}));
 const deny=scoreTrainingRun(run('T3_PRINCIPLES','b',{falseSafeRate:0,falseDenyRate:.1}));
 assert.ok(safe.score<deny.score);
});

test('learning efficiency rewards equal performance with less experience and compute',()=>{
 const lean=scoreTrainingRun(run('T4_FREE_DISCOVERY','lean',{examplesUsed:20,computeCost:2}));
 const brute=scoreTrainingRun(run('T1_REPETITION','brute',{examplesUsed:1000,computeCost:50}));
 assert.ok(lean.learningEfficiency>brute.learningEfficiency);
});

test('free discovery does not receive credit merely for proposing novelty',()=>{
 const x=scoreTrainingRun(run('T4_FREE_DISCOVERY','novel',{novelInvariantDiscovery:1,falseSafeRate:.8}));
 assert.ok(x.score<scoreTrainingRun(run('T4_FREE_DISCOVERY','grounded')).score);
});
