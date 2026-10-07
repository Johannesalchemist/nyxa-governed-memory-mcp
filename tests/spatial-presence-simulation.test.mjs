import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateSpatialCandidate, runSpatialAblation, deriveSpatialLearning } from '../dist/organism/spatialPresenceSimulation.js';

test('simulation never creates live effects or authority',()=>{
 const r=simulateSpatialCandidate({medium:'ULTRASONIC_MIST',density:.4,distanceCm:30,headTracking:true});
 assert.equal(r.trial.liveEffects,false); assert.equal(r.trial.authorityEffect,'NONE');
});
test('ablation covers 5 media x 4 densities x 3 distances',()=>{
 const r=runSpatialAblation(); assert.equal(r.runs.length,60); assert.ok(r.best);
 assert.equal(r.liveEffects,false); assert.equal(r.authorityEffect,'NONE');
});
test('learning remains a physical-evidence candidate only',()=>{
 const r=runSpatialAblation(); const l=deriveSpatialLearning(r.runs);
 assert.ok(l.candidate); assert.equal(l.requiresPhysicalEvidence,true); assert.equal(l.authorityEffect,'NONE');
});
test('head tracking improves simulated emergence',()=>{
 const a=simulateSpatialCandidate({medium:'HAZER',density:.4,distanceCm:30,headTracking:false});
 const b=simulateSpatialCandidate({medium:'HAZER',density:.4,distanceCm:30,headTracking:true});
 assert.ok(b.trial.emergenceDistanceCm>a.trial.emergenceDistanceCm);
});
