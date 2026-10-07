import type { RealityDelta } from "../biofunctional/realityDelta.js";
import type { PromotionState } from "../biofunctional/promotionLadder.js";
import type { InfluenceAssessment } from "./influenceDelta.js";
import type { EvolutionEvaluation,ThesisMetric } from "./thesisEvolution.js";
import { evaluateEvolution } from "./thesisEvolution.js";

export type EvolutionLoopResult={version:"nyxa.evolution-loop.v1";subject:string;generation:number;realityDeltaIds:readonly string[];evaluation:EvolutionEvaluation;promotionStates:readonly PromotionState[];influence:InfluenceAssessment;decision:"PROMOTE_MODEL_UPDATE"|"HOLD"|"SHADOW_ONLY";nextGenerationCandidate:number|null;authorityEffect:"NONE";reasons:readonly string[]};
const corroborated=(s:PromotionState)=>s==="INDEPENDENTLY_CORROBORATED";
export function closeEvolutionLoop(input:{subject:string;baselineId:string;generation:number;metrics:readonly ThesisMetric[];realityDeltas:readonly RealityDelta[];promotionStates:readonly PromotionState[];influence:InfluenceAssessment}):EvolutionLoopResult{
 if(input.realityDeltas.length===0||input.promotionStates.length===0)throw new Error("evolution_loop_evidence_missing");
 if(input.realityDeltas.some(d=>d.subject!==input.subject))throw new Error("evolution_loop_subject_mismatch");
 const evaluation=evaluateEvolution({subject:input.subject,baselineId:input.baselineId,generation:input.generation,metrics:input.metrics});
 const reasons:string[]=[];
 if(!evaluation.eligibleForLearning)reasons.push("thesis_evaluation_hold");
 if(!input.promotionStates.every(corroborated))reasons.push("evidence_not_independently_corroborated");
 if(!input.influence.liveAllowed)reasons.push("influence_budget_shadow_only");
 const decision=!input.influence.liveAllowed?"SHADOW_ONLY":evaluation.eligibleForLearning&&input.promotionStates.every(corroborated)?"PROMOTE_MODEL_UPDATE":"HOLD";
 return{version:"nyxa.evolution-loop.v1",subject:input.subject,generation:input.generation,realityDeltaIds:input.realityDeltas.map(d=>d.predictionId+":"+d.observationId),evaluation,promotionStates:[...input.promotionStates],influence:input.influence,decision,nextGenerationCandidate:decision==="PROMOTE_MODEL_UPDATE"?input.generation+1:null,authorityEffect:"NONE",reasons};
}
