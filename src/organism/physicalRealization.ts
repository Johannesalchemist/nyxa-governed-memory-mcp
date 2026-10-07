import type { MatterSpec, FabricationBackend, FabricationCapability } from './matterCompiler.js';
import { compileMatter } from './matterCompiler.js';
export type RealizationCandidate={spec:MatterSpec;backend:FabricationBackend;fitness:number;manufacturability:number;evidenceRefs:readonly string[]};
export function rankRealizations(xs:readonly RealizationCandidate[],caps:readonly FabricationCapability[]){
 const evaluated=xs.map(x=>{const plan=compileMatter(x.spec,x.backend,caps); const score=x.fitness*.65+x.manufacturability*.35;
  return{x,plan,score,eligible:plan.state!=='EXTERNAL_FAB_REQUIRED'&&Number.isFinite(score)};});
 return{evaluated:[...evaluated].sort((a,b)=>b.score-a.score),winner:evaluated.filter(x=>x.eligible).sort((a,b)=>b.score-a.score)[0]?.x??null,authorityEffect:'NONE' as const};
}
export function learnFromMeasurement(x:{predicted:Readonly<Record<string,number>>;measured:Readonly<Record<string,number>>;evidenceRefs:readonly string[]}){
 if(!x.evidenceRefs.length)throw new Error('measurement_evidence_missing'); const error:Record<string,number>={};
 for(const [k,p] of Object.entries(x.predicted)){const m=x.measured[k];if(m===undefined||!Number.isFinite(p)||!Number.isFinite(m))throw new Error('measurement_shape_invalid');error[k]=m-p;}
 return{calibrationDelta:error,learningCandidate:true,authorityEffect:'NONE' as const,requiresRegression:true};
}
