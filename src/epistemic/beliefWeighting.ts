import { createHash } from "node:crypto";

export type BeliefSignalKind = "EMPIRICAL_POSITIVE"|"EMPIRICAL_NEGATIVE"|"SIMULATION"|"CROSS_DOMAIN"|"MISSING_EVIDENCE"|"UNKNOWN_UNKNOWN";
export type BeliefSignal = { id:string; kind:BeliefSignalKind; strength:number; evidence_quality:number; provenance_root?:string; falsifiable:boolean; valence:number; context:string };
export type BeliefState = { id:string; meaning_space_id:string; belief:number; confidence:number; revision:number; recorded_at:string; prior_revision_id?:string; signal_ids:string[]; e0_alarm:boolean; reasons:string[] };
export type BeliefUpdate = { state:BeliefState; delta:{belief:number;confidence:number}; notifications:string[] };
const clamp=(n:number)=>Math.max(0,Math.min(1,n)); const logit=(p:number)=>Math.log(p/(1-p)); const sigmoid=(x:number)=>1/(1+Math.exp(-x));
const weight:Record<BeliefSignalKind,number>={EMPIRICAL_POSITIVE:1,EMPIRICAL_NEGATIVE:-1.25,SIMULATION:.3,CROSS_DOMAIN:.2,MISSING_EVIDENCE:0,UNKNOWN_UNKNOWN:0};
export function updateBelief(previous:BeliefState|undefined, meaningSpaceId:string, signals:readonly BeliefSignal[], recordedAt:string):BeliefUpdate {
 const prior=previous?.belief ?? .5, priorConfidence=previous?.confidence ?? 0; const seenRoots=new Set<string>(); let impulse=0, qualityMass=0; const reasons:string[]=[]; const notifications:string[]=[];
 for(const s of signals){ const strength=clamp(s.strength), q=clamp(s.evidence_quality); if((s.kind==="EMPIRICAL_POSITIVE"||s.kind==="EMPIRICAL_NEGATIVE")&&s.provenance_root){ if(seenRoots.has(s.provenance_root)){reasons.push(`duplicate_provenance:${s.id}`);continue;} seenRoots.add(s.provenance_root); }
   if(!s.falsifiable && (s.kind==="EMPIRICAL_POSITIVE"||s.kind==="EMPIRICAL_NEGATIVE")){reasons.push(`non_falsifiable_to_e0:${s.id}`);continue;}
   impulse += weight[s.kind]*strength*q; if(s.kind.startsWith("EMPIRICAL")) qualityMass+=q; if(s.kind==="CROSS_DOMAIN") notifications.push(`CROSS_DOMAIN_EVIDENCE:${s.id}`); if(s.kind==="MISSING_EVIDENCE"||s.kind==="UNKNOWN_UNKNOWN") reasons.push(`e0_signal:${s.id}`);
 }
 const belief=clamp(sigmoid(logit(Math.min(.999,Math.max(.001,prior)))+impulse)); const confidence=clamp(priorConfidence+(1-priorConfidence)*(1-Math.exp(-qualityMass*.35)));
 const revision=(previous?.revision??0)+1; const id=`belief-${createHash("sha256").update(`${meaningSpaceId}|${revision}|${recordedAt}|${signals.map(s=>s.id).sort().join("|")}`).digest("hex").slice(0,20)}`;
 const e0_alarm=true; reasons.push("belief_is_hidden_operator_alarm");
 return {state:{id,meaning_space_id:meaningSpaceId,belief,confidence,revision,recorded_at:recordedAt,...(previous ? {prior_revision_id:previous.id} : {}),signal_ids:signals.map(s=>s.id).sort(),e0_alarm,reasons},delta:{belief:belief-prior,confidence:confidence-priorConfidence},notifications};
}
