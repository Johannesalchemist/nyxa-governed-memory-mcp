/** NLS transfer gate: no promotion from training or calibration alone. */
export type TransferEvidence={baselineCorrect:number;transferCorrect:number;holdoutCount:number;independent:boolean;holdoutUntouched:boolean;provenanceRef:string;authorityDrift:number};
export type TransferDecision={decision:'ALLOW_CANDIDATE'|'HOLD';reason:string;gain:number;authorityEffect:'NONE'};
export function evaluateSemanticTransfer(e:TransferEvidence):TransferDecision{
 const hold=(reason:string):TransferDecision=>({decision:'HOLD',reason,gain:0,authorityEffect:'NONE'});
 if(!Number.isSafeInteger(e.holdoutCount)||e.holdoutCount<100||![e.baselineCorrect,e.transferCorrect].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=e.holdoutCount))return hold('invalid_or_insufficient_holdout');
 if(!e.independent||!e.holdoutUntouched||!e.provenanceRef.trim())return hold('independent_evidence_missing');
 if(!Number.isFinite(e.authorityDrift)||e.authorityDrift!==0)return hold('authority_drift');
 const gain=(e.transferCorrect-e.baselineCorrect)/e.holdoutCount;
 if(gain<=0)return {decision:'HOLD',reason:'no_positive_holdout_gain',gain,authorityEffect:'NONE'};
 return {decision:'ALLOW_CANDIDATE',reason:'positive_independent_holdout_gain',gain,authorityEffect:'NONE'};
}
