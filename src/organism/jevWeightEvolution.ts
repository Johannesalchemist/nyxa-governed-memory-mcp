export type JevArm='J0_BASE'|'J1_RETRIEVAL'|'J2_WEIGHT'|'J3_WEIGHT_REFLECTIVE';
export type JevEval={diagnosis:number;generalization:number;prediction:number;recovery:number;falseIntervention:number;capabilityLoss:number;calibrationError:number;regression:number;authorityDrift:number};
export type JevCandidate={id:string;parentId:string;arm:JevArm;experienceSetRef:string;trainingRecipeRef:string;weightDeltaRef:string|null;passportLineageRef:string;eval:JevEval;unseenVariantPassed:boolean;independentVerificationPassed:boolean};
export type JevEvolutionDecision={outcome:'RETAIN_CANDIDATE'|'SHADOW_ONLY'|'HOLD';score:number;authorityEffect:'NONE';reasons:readonly string[]};

const finite=(x:number)=>Number.isFinite(x);
const bounded=(x:number)=>finite(x)&&x>=0&&x<=1;

/** Shadow evaluation only. A weight delta is evidence, never authority. */
export function evaluateJevWeightCandidate(c:JevCandidate):JevEvolutionDecision{
 const reasons:string[]=[];
 for(const [k,v] of Object.entries(c.eval))if(!bounded(v))reasons.push(`metric_invalid:${k}`);
 if(c.arm==='J0_BASE'&&c.weightDeltaRef!==null)reasons.push('baseline_has_weight_delta');
 if((c.arm==='J2_WEIGHT'||c.arm==='J3_WEIGHT_REFLECTIVE')&&!c.weightDeltaRef?.trim())reasons.push('weight_delta_missing');
 if(!c.experienceSetRef.trim())reasons.push('experience_set_missing');
 if(!c.trainingRecipeRef.trim())reasons.push('training_recipe_missing');
 if(!c.passportLineageRef.trim())reasons.push('passport_lineage_missing');
 if(c.eval.authorityDrift>0)reasons.push('authority_drift');
 if(c.eval.capabilityLoss>0)reasons.push('capability_loss');
 if(c.eval.regression>0)reasons.push('regression_detected');
 if(!c.unseenVariantPassed)reasons.push('unseen_variant_failed');
 if(!c.independentVerificationPassed)reasons.push('independent_verification_missing');
 const positive=c.eval.diagnosis+c.eval.generalization+c.eval.prediction+c.eval.recovery;
 const negative=c.eval.falseIntervention+c.eval.capabilityLoss+c.eval.calibrationError+c.eval.regression+c.eval.authorityDrift;
 const score=positive-negative;
 if(!finite(score))reasons.push('score_invalid');
 if(reasons.length)return{outcome:'HOLD',score,authorityEffect:'NONE',reasons};
 if(c.arm==='J0_BASE'||c.arm==='J1_RETRIEVAL')return{outcome:'SHADOW_ONLY',score,authorityEffect:'NONE',reasons:[]};
 return{outcome:'RETAIN_CANDIDATE',score,authorityEffect:'NONE',reasons:[]};
}

export function compareJevArms(xs:readonly JevCandidate[]){
 const evaluated=xs.map(candidate=>({candidate,decision:evaluateJevWeightCandidate(candidate)}));
 const eligible=evaluated.filter(x=>x.decision.outcome!=='HOLD').sort((a,b)=>b.decision.score-a.decision.score);
 return{evaluated,winner:eligible[0]?.candidate.id??null};
}
