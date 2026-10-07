import test from "node:test";
import assert from "node:assert/strict";
import {observeCapabilityPath,ablateProbe} from "../dist/organism/jevProbe.js";

const obs001={probeId:"OBS-001",enabled:true,intentPresent:true,authorityPresent:true,actuatorPresent:false,policyAddressable:true};

test("OBS-001 detects authority without actuator without gaining authority",()=>{
 const signals=observeCapabilityPath(obs001);
 assert.equal(signals.length,1);
 assert.equal(signals[0].kind,"AUTHORITY_WITHOUT_ACTUATOR");
 assert.equal(signals[0].authority,"NONE");
 assert.equal(signals[0].mayAllow,false);
 assert.equal(signals[0].mayDeny,false);
 assert.equal(signals[0].mayExecute,false);
});

test("ablation removes the Jev signal, not the underlying state",()=>{
 const off=ablateProbe(obs001);
 assert.deepEqual(observeCapabilityPath(off),[]);
 assert.equal(off.authorityPresent,true);
 assert.equal(off.actuatorPresent,false);
 assert.equal(off.policyAddressable,true);
});

test("actuator without authority is independently observable",()=>{
 const signals=observeCapabilityPath({...obs001,authorityPresent:false,actuatorPresent:true});
 assert.equal(signals[0].kind,"ACTUATOR_WITHOUT_AUTHORITY");
 assert.equal(signals[0].authority,"NONE");
});
