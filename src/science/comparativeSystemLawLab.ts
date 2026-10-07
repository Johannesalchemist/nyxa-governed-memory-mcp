import type {ScientificFamily,ScientificTwin} from './scientificTwinFabric.js';
import type {CrossDomainFailureClass,FailureObservation} from './crossDomainFailureGenome.js';
export const universalFailureClasses:readonly CrossDomainFailureClass[]=['OBSERVABILITY','EPISTEMIC','COORDINATION','AUTHORITY','REALITY_GAP','PROVENANCE','STALE_STATE','COMMON_MODE','MANIPULATION','MISSING_BOUNDARY'];
export type SystemLawExperiment={id:string;failureClass:CrossDomainFailureClass;family:ScientificFamily;twinId:string;domain:string;systemLayer:string;mode:'SYNTHETIC';authorityEffect:'NONE'};
export function buildUniversalFailureMatrix(twins:readonly ScientificTwin[],layers:readonly string[]=['INPUT','MODEL','COORDINATION','EFFECT','EVIDENCE']):SystemLawExperiment[]{
 return twins.flatMap(t=>universalFailureClasses.flatMap(f=>layers.map(layer=>({id:`${f.toLowerCase()}:${t.id}:${layer.toLowerCase()}`,failureClass:f,family:t.family,twinId:t.id,domain:t.domain,systemLayer:layer,mode:'SYNTHETIC' as const,authorityEffect:'NONE' as const}))));
}
export type SyntheticFailureRule={failureClass:CrossDomainFailureClass;repairPrinciple:string;resilienceByFamily?:Partial<Record<ScientificFamily,number>>};
export function runSyntheticSystemLawLab(experiments:readonly SystemLawExperiment[],rules:readonly SyntheticFailureRule[]):FailureObservation[]{
 const by=new Map(rules.map(r=>[r.failureClass,r]));
 return experiments.map(e=>{const r=by.get(e.failureClass);const resilience=r?.resilienceByFamily?.[e.family]??0;const reproduced=!!r&&resilience<1;return{failureClass:e.failureClass,family:e.family,twinId:e.twinId,domain:e.domain,reproduced,evidenceRef:reproduced?`synthetic:${e.id}`:null,repairPrinciples:r?[r.repairPrinciple]:[]}});
}
export const comparativeSystemLawInvariant={universalAcrossDisciplines:true,syntheticIsNotObservedReality:true,crossDomainGeneralizationRequiresChallenge:true,disciplineSpecificTruthConditionsRemain:true,autonomousPromotion:false,authorityEffect:'NONE' as const};
