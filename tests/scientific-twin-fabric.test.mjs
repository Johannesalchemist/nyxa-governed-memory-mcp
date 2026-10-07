import test from 'node:test';import assert from 'node:assert/strict';import {ScientificTwinFabric,scientificTwins,initialScientificTwinMap} from '../dist/science/scientificTwinFabric.js';
test('fabric has exactly eight capability families',()=>assert.equal(scientificTwins.families().length,8));
test('initial map creates domain twins inside families',()=>{assert.ok(initialScientificTwinMap.length>=20);assert.ok(scientificTwins.domain('materials').length>=1)});
test('same family contains twins for different domains',()=>{const s=scientificTwins.families().find(x=>x.family==='SIMULATION');assert.ok(s.twinIds.includes('simulation.materials'));assert.ok(s.twinIds.includes('simulation.robotics'))});
test('evidence-supported twin requires evidence',()=>{const f=new ScientificTwinFabric();assert.throws(()=>f.register({id:'x.test',family:'DATA',domain:'x',capabilityRefs:[],evidenceRefs:[],state:'EVIDENCE_SUPPORTED',authorityEffect:'NONE'}),/evidence_missing/)});
test('registered fabric never grants authority',()=>assert.equal(scientificTwins.coverage().authorityEffect,'NONE'));
