export type PredictedOutcome='POSITIVE'|'NEGATIVE'|'NEUTRAL'|'INTRODUCTION'|'COMMITMENT';
export interface PredictionReceipt {id:string;entityId:string;predicted:PredictedOutcome;probability:number;frozenAt:string;modelVersion:string}
export interface ObservedOutcome {predictionId:string;actual:PredictedOutcome;source:string;observedAt:string}
export interface CalibrationResult {count:number;brierScore:number;accuracy:number;truthState:'OBSERVED'}
export function calibrate(predictions:PredictionReceipt[],outcomes:ObservedOutcome[]):CalibrationResult{const om=new Map(outcomes.map(o=>[o.predictionId,o]));let n=0,b=0,hit=0;for(const p of predictions){const o=om.get(p.id);if(!o)continue;n++;const y=o.actual===p.predicted?1:0;b+=(p.probability-y)**2;if(y)hit++}return {count:n,brierScore:n?b/n:0,accuracy:n?hit/n:0,truthState:'OBSERVED'}}
