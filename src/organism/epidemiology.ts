export type EpistemicExposure={assumptionId:string;consumerId:string;rootSourceId:string;decisionInfluence:number};
export type EpistemicSpread={assumptionId:string;exposures:number;uniqueConsumers:number;uniqueRoots:number;effectiveRootRatio:number;meanDecisionInfluence:number;requiresReview:boolean};
export function measureEpistemicSpread(events:readonly EpistemicExposure[]):EpistemicSpread{
 if(!events.length)throw new Error("epidemiology_empty");const first=events[0];if(!first)throw new Error("epidemiology_empty");const a=first.assumptionId;if(events.some(e=>e.assumptionId!==a))throw new Error("epidemiology_mixed_assumptions");
 for(const e of events)if(!e.consumerId||!e.rootSourceId||!Number.isFinite(e.decisionInfluence)||e.decisionInfluence<0||e.decisionInfluence>1)throw new Error("epidemiology_invalid");
 const consumers=new Set(events.map(e=>e.consumerId));const roots=new Set(events.map(e=>e.rootSourceId));const mean=events.reduce((s,e)=>s+e.decisionInfluence,0)/events.length;
 return {assumptionId:a,exposures:events.length,uniqueConsumers:consumers.size,uniqueRoots:roots.size,effectiveRootRatio:roots.size/events.length,meanDecisionInfluence:mean,requiresReview:consumers.size>=3&&mean>=0.25};
}
export function effectivePerspectiveCount(rootSourceIds:readonly string[]):number{return new Set(rootSourceIds.filter(Boolean)).size;}
