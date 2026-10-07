import { createHash } from "node:crypto";
import { safeJsonStringify } from "../utils/safeJson.js";
import { buildOrganismSignal,type OrganismSignalEnvelope } from "./signalEnvelope.js";

export type MorphologyMode="H0_HUMAN"|"H1_BIO_INSPIRED"|"H2_FREE";
export type BodyRegion="head"|"torso"|"left_arm"|"right_arm"|"left_leg"|"right_leg"|"surface";
export type BodyNode={region:BodyRegion;massKg:number;computeW:number;actuatorW:number;thermalAreaM2:number;coolantCapacityW:number};
export type MorphologyCandidate={version:"nyxa.morphology.v1";id:string;mode:MorphologyMode;generation:number;humanConformity:number;nodes:readonly BodyNode[];provenanceRefs:readonly string[];truthState:"SIMULATED";authority:"none"};
export type Scenario={id:string;ambientC:number;durationS:number;computeLoad:number;actuatorLoad:number;airflowMps:number};
export type MorphologyMetrics={peakTempC:number;thermalHeadroomC:number;energyKJ:number;massKg:number;computeCapacityW:number;humanConformity:number;safeTouch:boolean};
export type MorphologyEvaluation={version:"nyxa.morphology-evaluation.v1";candidateId:string;scenarioId:string;metrics:MorphologyMetrics;simulatorRef:"nyxa.homeostasis-surrogate.v0";truthState:"SIMULATED";authority:"none"};

const finite=(n:number)=>Number.isFinite(n);
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function buildMorphologyCandidate(input:{mode:MorphologyMode;generation:number;humanConformity:number;nodes:readonly BodyNode[];provenanceRefs:readonly string[]}):MorphologyCandidate{
 if(!Number.isInteger(input.generation)||input.generation<0||!finite(input.humanConformity)||input.humanConformity<0||input.humanConformity>1||!input.nodes.length||!input.provenanceRefs.length)throw new Error("morphology_identity_invalid");
 if(input.mode==="H0_HUMAN"&&input.humanConformity<.98)throw new Error("h0_human_envelope_required");
 if(input.mode==="H1_BIO_INSPIRED"&&input.humanConformity<.80)throw new Error("h1_human_compatibility_required");
 for(const n of input.nodes)for(const v of [n.massKg,n.computeW,n.actuatorW,n.thermalAreaM2,n.coolantCapacityW])if(!finite(v)||v<0)throw new Error("morphology_node_invalid");
 const material={...input,nodes:input.nodes.map(n=>({...n})),provenanceRefs:[...input.provenanceRefs].sort()};
 const id="morph_"+createHash("sha256").update(safeJsonStringify(material)).digest("hex").slice(0,32);
 return Object.freeze({version:"nyxa.morphology.v1",id,...input,nodes:Object.freeze(input.nodes.map(n=>Object.freeze({...n}))),provenanceRefs:Object.freeze([...input.provenanceRefs]),truthState:"SIMULATED",authority:"none"});
}
export function simulateHomeostasis(c:MorphologyCandidate,s:Scenario):MorphologyEvaluation{
 if(!s.id.trim()||![s.ambientC,s.durationS,s.computeLoad,s.actuatorLoad,s.airflowMps].every(finite)||s.durationS<=0||s.computeLoad<0||s.actuatorLoad<0||s.airflowMps<0)throw new Error("homeostasis_scenario_invalid");
 const mass=c.nodes.reduce((a,n)=>a+n.massKg,0), compute=c.nodes.reduce((a,n)=>a+n.computeW,0);
 const heat=c.nodes.reduce((a,n)=>a+n.computeW*s.computeLoad+n.actuatorW*s.actuatorLoad,0);
 const cooling=c.nodes.reduce((a,n)=>a+n.coolantCapacityW+n.thermalAreaM2*(8+6*Math.sqrt(s.airflowMps)),0);
 const thermalMass=Math.max(1,mass*900), net=Math.max(0,heat-cooling);
 const peak=s.ambientC+net*s.durationS/thermalMass+heat/Math.max(20,cooling)*3;
 const touchLimit=43, peakTempC=Number(peak.toFixed(3));
 const metrics={peakTempC,thermalHeadroomC:Number((touchLimit-peakTempC).toFixed(3)),energyKJ:Number((heat*s.durationS/1000).toFixed(3)),massKg:Number(mass.toFixed(3)),computeCapacityW:Number(compute.toFixed(3)),humanConformity:c.humanConformity,safeTouch:peakTempC<=touchLimit};
 return Object.freeze({version:"nyxa.morphology-evaluation.v1",candidateId:c.id,scenarioId:s.id,metrics:Object.freeze(metrics),simulatorRef:"nyxa.homeostasis-surrogate.v0",truthState:"SIMULATED",authority:"none"});
}
export function morphologyFitness(e:MorphologyEvaluation,mode:MorphologyMode):number{
 const m=e.metrics;if(!m.safeTouch)return -1e6;
 const conformity=mode==="H2_FREE"?0:m.humanConformity*30;
 return Number((m.thermalHeadroomC*4+m.computeCapacityW/20-m.energyKJ/10-m.massKg+conformity).toFixed(6));
}
export function signalFromMorphologyEvaluation(e:MorphologyEvaluation,parentSignalIds:readonly string[]=[]):OrganismSignalEnvelope{
 return buildOrganismSignal({kind:"SIMULATION_CANDIDATE",producer:"twin",truthState:"SIMULATED",subject:"morphology:"+e.candidateId+":"+e.scenarioId,payload:e,provenanceRefs:[e.simulatorRef,e.candidateId],parentSignalIds});
}
export function baselineHumanH0():MorphologyCandidate{
 const nodes:BodyNode[]=[
  {region:"head",massKg:5,computeW:80,actuatorW:12,thermalAreaM2:.12,coolantCapacityW:35},
  {region:"torso",massKg:32,computeW:420,actuatorW:80,thermalAreaM2:.65,coolantCapacityW:260},
  {region:"left_arm",massKg:4.5,computeW:55,actuatorW:120,thermalAreaM2:.22,coolantCapacityW:70},
  {region:"right_arm",massKg:4.5,computeW:55,actuatorW:120,thermalAreaM2:.22,coolantCapacityW:70},
  {region:"left_leg",massKg:9,computeW:45,actuatorW:260,thermalAreaM2:.38,coolantCapacityW:120},
  {region:"right_leg",massKg:9,computeW:45,actuatorW:260,thermalAreaM2:.38,coolantCapacityW:120},
  {region:"surface",massKg:3,computeW:10,actuatorW:0,thermalAreaM2:.9,coolantCapacityW:90}
 ];
 return buildMorphologyCandidate({mode:"H0_HUMAN",generation:0,humanConformity:1,nodes,provenanceRefs:["human-envelope:baseline-v0","thermal-model:surrogate-v0"]});
}
