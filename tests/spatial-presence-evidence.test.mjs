import test from 'node:test'; import assert from 'node:assert/strict';
import {validatePhysicalEvidence,calibrateFromPairs,physicalBenchProtocol} from '../dist/organism/spatialPresenceEvidence.js';
const trial={medium:'HAZER',mode:'SIMULATION_ONLY',liveEffects:false,authorityEffect:'NONE',emergenceDistanceCm:20,contrast:.5,edgeSharpness:.6,stability:.7,latencyMs:40,mediumVisibility:.2};
const ev=i=>({id:'e'+i,medium:'HAZER',capturedAt:'2026-10-08T12:00:00Z',deviceRef:'bench-1',operatorRef:'human-1',trial:{...trial},ambient:{lux:20,temperatureC:21,humidityPct:50},source:'OBSERVED_REALITY'});
test('physical evidence requires provenance',()=>{assert.equal(validatePhysicalEvidence({...ev(1),deviceRef:''}).accepted,false)});
test('three observations can calibrate without granting authority',()=>{const pairs=[1,2,3].map(i=>({predicted:{...trial,contrast:.55},observed:ev(i)}));const c=calibrateFromPairs(pairs)[0];assert.equal(c.eligible,true)});
test('one observation cannot calibrate model',()=>{const c=calibrateFromPairs([{predicted:trial,observed:ev(1)}])[0];assert.equal(c.eligible,false);assert.ok(c.reasons.includes('insufficient_independent_observations'))});
test('bench remains calibration-only',()=>{assert.equal(physicalBenchProtocol.autonomousLiveActivation,false);assert.equal(physicalBenchProtocol.authorityEffect,'NONE')});
