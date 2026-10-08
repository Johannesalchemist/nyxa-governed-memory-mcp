import test from 'node:test';import assert from 'node:assert/strict';import {heilbronnRuntime,runtimeReady,claimGate} from '../dist/science/buildingTwinRuntime.js';
test('regional runtime has executable EnergyPlus plus temperature wind solar evidence',()=>assert.equal(runtimeReady(heilbronnRuntime),true));
test('nearby temperature and wind stations are selected',()=>{assert.ok(heilbronnRuntime.weather.find(x=>x.variable==='TEMPERATURE').distanceKm<10);assert.ok(heilbronnRuntime.weather.find(x=>x.variable==='WIND').distanceKm<15)});
test('missing OpenModelica blocks cross-engine claim',()=>{const g=claimGate(heilbronnRuntime);assert.equal(g.simulationReady,true);assert.equal(g.crossEngineReady,false);assert.equal(g.physicalClaimReady,false)});
