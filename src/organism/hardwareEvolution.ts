import { createHash } from "node:crypto";
import { safeJsonStringify } from "../utils/safeJson.js";
import { buildOrganismSignal,type OrganismSignalEnvelope } from "./signalEnvelope.js";
export type HardwareObjective={metric:string;direction:"MINIMIZE"|"MAXIMIZE";weight:number};
export type HardwareEvolutionCandidate={version:"nyxa.hardware-evolution.v1";id:string;nodeClass:string;lineageRefs:readonly string[];architecture:Readonly<Record<string,string|number|boolean>>;objectives:readonly HardwareObjective[];workloadEvidenceRefs:readonly string[];truthState:"SIMULATED";authority:"none"};
export function buildHardwareEvolutionCandidate(input:Omit<HardwareEvolutionCandidate,"version"|"id"|"truthState"|"authority">):HardwareEvolutionCandidate{
 if(!input.nodeClass.trim()||!input.lineageRefs.length||!input.workloadEvidenceRefs.length||!input.objectives.length)throw new Error("hardware_evolution_identity_invalid");
 for(const o of input.objectives)if(!o.metric.trim()||!Number.isFinite(o.weight)||o.weight<=0)throw new Error("hardware_evolution_objective_invalid");
 for(const v of Object.values(input.architecture))if(typeof v==="number"&&!Number.isFinite(v))throw new Error("hardware_evolution_architecture_invalid");
 const material={...input,lineageRefs:[...input.lineageRefs].sort(),workloadEvidenceRefs:[...input.workloadEvidenceRefs].sort()};
 const id="hw_"+createHash("sha256").update(safeJsonStringify(material)).digest("hex").slice(0,32);
 return Object.freeze({version:"nyxa.hardware-evolution.v1",id,truthState:"SIMULATED",authority:"none",...input,architecture:Object.freeze({...input.architecture}),objectives:Object.freeze(input.objectives.map(o=>Object.freeze({...o}))),lineageRefs:Object.freeze([...input.lineageRefs]),workloadEvidenceRefs:Object.freeze([...input.workloadEvidenceRefs])});
}
export function signalFromHardwareEvolutionCandidate(candidate:HardwareEvolutionCandidate,parentSignalIds:readonly string[]=[]):OrganismSignalEnvelope{
 if(candidate.authority!=="none"||candidate.truthState!=="SIMULATED")throw new Error("hardware_evolution_power_or_truth_escalation");
 return buildOrganismSignal({kind:"SIMULATION_CANDIDATE",producer:"hunter",truthState:"SIMULATED",subject:"hardware:"+candidate.nodeClass+":"+candidate.id,payload:candidate,provenanceRefs:[...candidate.workloadEvidenceRefs,...candidate.lineageRefs],parentSignalIds});
}
export type HardwareEvaluation={candidateId:string;simulatorRef:string;metrics:Readonly<Record<string,number>>;evaluatedAt:string;authority:"none"};
export function buildHardwareEvaluation(input:Omit<HardwareEvaluation,"authority">):HardwareEvaluation{
 if(!input.candidateId.trim()||!input.simulatorRef.trim()||!Number.isFinite(Date.parse(input.evaluatedAt)))throw new Error("hardware_evaluation_invalid");
 for(const v of Object.values(input.metrics))if(!Number.isFinite(v))throw new Error("hardware_evaluation_metric_invalid");
 return Object.freeze({...input,metrics:Object.freeze({...input.metrics}),authority:"none"});
}
export function signalFromHardwareEvaluation(evaluation:HardwareEvaluation,parentSignalIds:readonly string[]=[]):OrganismSignalEnvelope{
 return buildOrganismSignal({kind:"SIMULATION_CANDIDATE",producer:"twin",truthState:"SIMULATED",subject:"hardware-evaluation:"+evaluation.candidateId,payload:evaluation,provenanceRefs:[evaluation.simulatorRef,evaluation.candidateId],parentSignalIds});
}
