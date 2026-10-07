import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSpatialPresenceTrial, spatialPresenceAblation, spatialPresenceInvariant } from '../dist/organism/spatialPresence.js';

const base={medium:'ULTRASONIC_MIST',mode:'SIMULATION_ONLY',liveEffects:false,authorityEffect:'NONE',
  emergenceDistanceCm:30,contrast:0.7,edgeSharpness:0.6,stability:0.8,latencyMs:20,mediumVisibility:0.2};

test('simulation-only trial is eligible for research evaluation',()=>{
  assert.deepEqual(assessSpatialPresenceTrial(base),{eligible:true,reasons:[]});
});
test('invalid metric fails closed',()=>{
  const r=assessSpatialPresenceTrial({...base,latencyMs:-1});
  assert.equal(r.eligible,false); assert.ok(r.reasons.includes('INVALID_LATENCYMS'));
});
test('ablation includes all aerosol candidates',()=>{
  assert.deepEqual(spatialPresenceAblation,['HAZER','FOG','ULTRASONIC_MIST','DRY_ICE_FOG','SCENT_AEROSOL']);
});
test('live activation and laser software-only safety are forbidden by invariant',()=>{
  assert.equal(spatialPresenceInvariant.autonomousLiveActivation,false);
  assert.equal(spatialPresenceInvariant.physicalLaserSafetyInterlockRequired,true);
  assert.equal(spatialPresenceInvariant.scentAndOpticalAerosolAreDistinctChannels,true);
});
