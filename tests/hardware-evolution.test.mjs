import test from "node:test";
import assert from "node:assert/strict";
import {buildHardwareEvolutionCandidate,buildHardwareEvaluation,signalFromHardwareEvolutionCandidate,signalFromHardwareEvaluation} from "../dist/organism/hardwareEvolution.js";
import {simulationTrustGate} from "../dist/organism/simValidation.js";

test("hardware simulation remains simulated and authority-free",()=>{
 const c=buildHardwareEvolutionCandidate({nodeClass:"autonomous-vehicle",lineageRefs:["jalapeno:seed","waymo:public-reference"],architecture:{sensor_fusion:true,heterogeneous_compute:true},objectives:[{metric:"pixels_to_actuation_latency_ms",direction:"MINIMIZE",weight:1},{metric:"energy_per_scenario_j",direction:"MINIMIZE",weight:1}],workloadEvidenceRefs:["munich:scenario-workload"]});
 const cs=signalFromHardwareEvolutionCandidate(c); assert.equal(cs.truthState,"SIMULATED"); assert.equal(cs.authority,"none");
 const e=buildHardwareEvaluation({candidateId:c.id,simulatorRef:"compute-twin:v0",metrics:{pixels_to_actuation_latency_ms:12.4,energy_per_scenario_j:31.2,memory_bandwidth_gbps:420},evaluatedAt:"2026-10-07T09:00:00Z"});
 const es=signalFromHardwareEvaluation(e,[cs.id]);
 assert.equal(es.kind,"SIMULATION_CANDIDATE"); assert.equal(es.truthState,"SIMULATED"); assert.equal(es.authority,"none");
});

test("simulated hardware fitness cannot self-promote",()=>{
 const gate=simulationTrustGate({selectedByFitness:true,frozenPrediction:true,outOfSimulatorValidated:false,heldOutSimulator:true});
 assert.equal(gate.trusted,false); assert.equal(gate.reason,"simulation_fitness_not_trust");
});

test("hardware evolution rejects invalid optimization inputs",()=>{
 assert.throws(()=>buildHardwareEvolutionCandidate({nodeClass:"x",lineageRefs:["seed"],architecture:{x:1},objectives:[{metric:"energy",direction:"MINIMIZE",weight:0}],workloadEvidenceRefs:["w"]}),/objective_invalid/);
 assert.throws(()=>buildHardwareEvaluation({candidateId:"x",simulatorRef:"sim",metrics:{x:Infinity},evaluatedAt:"2026-10-07T08:00:00Z"}),/metric_invalid/);
});
