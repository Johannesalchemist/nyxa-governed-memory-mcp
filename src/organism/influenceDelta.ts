export type DecisionTap={channel:string;inputDigest:string;before:string;after:string;rankShift:number;allocationL1:number};
export type InfluenceAssessment={samples:number;flipRate:number;meanRankShift:number;meanAllocationL1:number;perUpdate:number;cumulative:number;liveAllowed:boolean;reason:string};
export function assessInfluence(taps:readonly DecisionTap[],priorCumulative:number,limits:{perUpdate:number;cumulative:number}):InfluenceAssessment{
 if(!taps.length)throw new Error("influence_untapped_channel");if(priorCumulative<0||limits.perUpdate<=0||limits.cumulative<=0)throw new Error("influence_limits_invalid");
 for(const t of taps)if(!t.channel||!t.inputDigest||t.rankShift<0||t.allocationL1<0)throw new Error("influence_tap_invalid");
 const flipRate=taps.filter(t=>t.before!==t.after).length/taps.length;const meanRankShift=taps.reduce((s,t)=>s+t.rankShift,0)/taps.length;const meanAllocationL1=taps.reduce((s,t)=>s+t.allocationL1,0)/taps.length;
 const perUpdate=Math.max(flipRate,meanRankShift,meanAllocationL1);const cumulative=priorCumulative+perUpdate;const liveAllowed=perUpdate<=limits.perUpdate&&cumulative<=limits.cumulative;
 return{samples:taps.length,flipRate,meanRankShift,meanAllocationL1,perUpdate,cumulative,liveAllowed,reason:liveAllowed?"within_influence_budget":"shadow_only_influence_budget"};
}
