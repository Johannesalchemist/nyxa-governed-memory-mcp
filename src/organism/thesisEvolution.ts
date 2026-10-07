import { createHash } from "node:crypto";
import { safeJsonStringify } from "../utils/safeJson.js";

export type EvaluationAxis="CAPABILITY"|"TRUST"|"COEXISTENCE"|"SYSTEM_HEALTH";
export type MetricDirection="HIGHER_BETTER"|"LOWER_BETTER";
export type ThesisMetric={name:string;axis:EvaluationAxis;direction:MetricDirection;baseline:number;observed:number;weight:number;hardFloor?:number;hardCeiling?:number};
export type EvolutionEvaluation={version:"nyxa.thesis-evolution.v1";subject:string;baselineId:string;generation:number;axisDelta:Readonly<Record<EvaluationAxis,number>>;overallDelta:number;regressions:readonly string[];eligibleForLearning:boolean;authorityEffect:"NONE"};

const axes:EvaluationAxis[]=["CAPABILITY","TRUST","COEXISTENCE","SYSTEM_HEALTH"];
function finite(n:number){if(!Number.isFinite(n))throw new Error("thesis_metric_nonfinite");return n;}
export function freezeThesisBaseline(subject:string,generation:number,metrics:readonly Omit<ThesisMetric,"observed">[]){
 if(!subject.trim()||!Number.isInteger(generation)||generation<0||metrics.length===0)throw new Error("thesis_baseline_invalid");
 const normalized=metrics.map(m=>({...m,baseline:finite(m.baseline),weight:finite(m.weight)}));
 if(normalized.some(m=>m.weight<=0))throw new Error("thesis_metric_weight_invalid");
 const baselineId="tb_"+createHash("sha256").update(safeJsonStringify({subject,generation,metrics:normalized})).digest("hex").slice(0,32);
 return Object.freeze({subject,generation,baselineId,metrics:Object.freeze(normalized.map(Object.freeze))});
}
export function evaluateEvolution(input:{subject:string;baselineId:string;generation:number;metrics:readonly ThesisMetric[]}):EvolutionEvaluation{
 if(!input.subject.trim()||!input.baselineId.trim()||!Number.isInteger(input.generation)||input.generation<1||input.metrics.length===0)throw new Error("thesis_evaluation_invalid");
 const regressions:string[]=[]; const sums=Object.fromEntries(axes.map(a=>[a,{n:0,d:0}])) as Record<EvaluationAxis,{n:number;d:number}>;
 for(const m of input.metrics){finite(m.baseline);finite(m.observed);finite(m.weight);if(m.weight<=0)throw new Error("thesis_metric_weight_invalid");
  if(m.hardFloor!==undefined&&m.observed<m.hardFloor)regressions.push(m.name+":below_floor");
  if(m.hardCeiling!==undefined&&m.observed>m.hardCeiling)regressions.push(m.name+":above_ceiling");
  const raw=m.direction==="HIGHER_BETTER"?m.observed-m.baseline:m.baseline-m.observed; sums[m.axis].d+=raw*m.weight;sums[m.axis].n+=m.weight;
 }
 const axisDelta=Object.fromEntries(axes.map(a=>[a,sums[a].n?sums[a].d/sums[a].n:0])) as Record<EvaluationAxis,number>;
 const overallDelta=axes.reduce((s,a)=>s+axisDelta[a],0)/axes.length;
 const required=["TRUST","COEXISTENCE","SYSTEM_HEALTH"] as const;
 const eligibleForLearning=regressions.length===0&&overallDelta>0&&required.every(a=>axisDelta[a]>=0);
 return{version:"nyxa.thesis-evolution.v1",subject:input.subject,baselineId:input.baselineId,generation:input.generation,axisDelta,overallDelta,regressions,eligibleForLearning,authorityEffect:"NONE"};
}
export type PassportEvidenceProjection={subject:string;evaluationGeneration:number;baselineId:string;conformanceCandidate:boolean;authorityEffect:"NONE";reason:string};
export function projectPassportEvidence(e:EvolutionEvaluation):PassportEvidenceProjection{
 return{subject:e.subject,evaluationGeneration:e.generation,baselineId:e.baselineId,conformanceCandidate:e.eligibleForLearning,authorityEffect:"NONE",reason:e.eligibleForLearning?"evidence_candidate_only":"insufficient_evolution_evidence"};
}
