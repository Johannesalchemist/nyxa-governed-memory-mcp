import test from 'node:test';import assert from 'node:assert/strict';import {gateRealityTransition,realityFabricInvariant} from '../dist/organism/realityFabric.js';
const base={id:'t1',domain:'NYXA',from:'SIMULATION',to:'MATTER',truth:'SIMULATED',evidenceRefs:[],authorityEffect:'NONE',liveEffect:false};
test('simulated cross-layer transition remains non-live',()=>assert.equal(gateRealityTransition(base).eligible,true));
test('physical reality claim needs evidence',()=>assert.equal(gateRealityTransition({...base,truth:'BUILT'}).eligible,false));
test('live effect cannot inherit permission from fabric',()=>assert.equal(gateRealityTransition({...base,liveEffect:true}).eligible,false));
test('fabric spans four domains and six layers without authority inheritance',()=>{assert.equal(realityFabricInvariant.domains.length,4);assert.equal(realityFabricInvariant.layers.length,6);assert.equal(realityFabricInvariant.crossLayerAuthorityInheritance,false)});
