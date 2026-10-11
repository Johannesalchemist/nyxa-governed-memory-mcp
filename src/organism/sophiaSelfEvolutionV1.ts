/** Sophia improvement evaluation; no authority to deploy. */
import { assessSophiaAutonomy } from './sophiaAutonomyEnvelopeV1.js';
export type SophiaImprovementDomain = 'voice'|'dialogue'|'gaze'|'facial_animation'|'body_animation'|'hair'|'workflow'|'research';
export type SophiaImprovementProposal = Readonly<{ id:string; domain:SophiaImprovementDomain; tenantId:string; targetTenantId:string; baselineEvidence:string; candidateEvidence:string; measurableGain:number; independentReview:'APPROVED'|'DENIED'|'PENDING'; governanceDecision:'ALLOW'|'DENY'|'UNKNOWN'; verifiedMandate:boolean; involvesPersonalData:boolean; consentVerified:boolean; requestsExternalEffect:boolean }>;
export function evaluateSophiaImprovement(p:SophiaImprovementProposal) {
 const a=assessSophiaAutonomy({domain:p.domain==='research'?'research':'learning_candidate',tenantId:p.tenantId,targetTenantId:p.targetTenantId,involvesPersonalData:p.involvesPersonalData,consentVerified:p.consentVerified,hasVerifiedMandate:p.verifiedMandate,governanceApproved:p.governanceDecision==='ALLOW',requestedExternalEffect:p.requestsExternalEffect});
 if(!a.eligible) return {status:'HOLD' as const,reason:a.reason,authorityEffect:'NONE' as const};
 if(!p.id?.trim()||!p.baselineEvidence?.trim()||!p.candidateEvidence?.trim()||!Number.isFinite(p.measurableGain)||p.measurableGain<=0) return {status:'HOLD' as const,reason:'missing_or_nonpositive_quality_evidence',authorityEffect:'NONE' as const};
 if(p.independentReview!=='APPROVED'||p.governanceDecision!=='ALLOW'||!p.verifiedMandate) return {status:'HOLD' as const,reason:'independent_review_governance_and_mandate_required',authorityEffect:'NONE' as const};
 return {status:'CANDIDATE_FOR_GOVERNED_DISPATCH' as const,reason:'eligible_for_separate_execution_gate',authorityEffect:'NONE' as const};
}
