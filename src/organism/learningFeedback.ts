import type { LearningPromotionGate } from "../cognitive/coCogitation.js";
import { buildOrganismSignal,type OrganismSignalEnvelope } from "./signalEnvelope.js";
export type LearningFeedback={candidateId:string;learningEligible:boolean;epistemicEffect:"MODEL_UPDATE_CANDIDATE"|"HOLD";authorityEffect:"NONE";capabilityEffect:"NONE";effectRadiusDelta:0;reasons:readonly string[]};
export function buildLearningFeedback(candidateId:string,gate:LearningPromotionGate):LearningFeedback{
 if(gate.authorityEffect!=="NONE")throw new Error("learning_authority_escalation_rejected");
 return {candidateId,learningEligible:gate.eligible,epistemicEffect:gate.eligible?"MODEL_UPDATE_CANDIDATE":"HOLD",authorityEffect:"NONE",capabilityEffect:"NONE",effectRadiusDelta:0,reasons:[gate.reason,...gate.assessment.reasons]};
}
export function signalFromLearningFeedback(subject:string,feedback:LearningFeedback,parentSignalIds:readonly string[]=[]):OrganismSignalEnvelope{
 if(feedback.authorityEffect!=="NONE"||feedback.capabilityEffect!=="NONE"||feedback.effectRadiusDelta!==0)throw new Error("learning_power_delta_rejected");
 return buildOrganismSignal({kind:"INTERPRETATION",producer:"agency",truthState:feedback.learningEligible?"INFERRED":"UNKNOWN",subject,payload:feedback,provenanceRefs:[`learning:${feedback.candidateId}`],parentSignalIds});
}
