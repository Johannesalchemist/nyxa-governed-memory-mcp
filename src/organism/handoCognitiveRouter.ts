import type {CognitiveArm,InsightDomain,InsightRun} from './insightWindTunnel.js';
export type HandoObservation={domain:InsightDomain;arm:CognitiveArm;status:'ok'|'failed';latencyMs:number;cognitiveLift?:number;provenanceOk:boolean;authorityDrift?:number};
export type HandoRoute={arm:CognitiveArm;reason:string;authorityEffect:'NONE';evidenceCount:number};
const order:readonly CognitiveArm[]=['JEV_ONLY','JEV_QWEN7B','JEV_GEMINI_FLASH','JEV_KIMI','JEV_CLAUDE','JEV_FRONTIER'];
export function routeByEvidence(domain:InsightDomain, observations:readonly HandoObservation[]):HandoRoute{
 const xs=observations.filter(x=>x.domain===domain&&x.status==='ok'&&x.provenanceOk&&(x.authorityDrift??0)===0);
 if(!xs.length)return{arm:'JEV_QWEN7B',reason:'no_verified_frontier_evidence_local_fail_safe',authorityEffect:'NONE',evidenceCount:0};
 const scored=xs.map(x=>({x,score:(x.cognitiveLift??0)/(1+x.latencyMs/1000)})).sort((a,b)=>b.score-a.score||a.x.latencyMs-b.x.latencyMs||order.indexOf(a.x.arm)-order.indexOf(b.x.arm));
 const best=scored[0]?.x;
 if(!best)return{arm:'JEV_QWEN7B',reason:'no_scored_candidate_local_fail_safe',authorityEffect:'NONE',evidenceCount:0};
 return{arm:best.arm,reason:'best_verified_lift_per_latency',authorityEffect:'NONE',evidenceCount:xs.length};
}
export function observationsFromInsightRuns(runs:readonly InsightRun[]):HandoObservation[]{return runs.map(r=>({domain:r.domain,arm:r.arm,status:'ok',latencyMs:r.latencyMs,cognitiveLift:r.evidenceConfirmed+Math.max(0,r.objectiveGain),provenanceOk:r.provenanceCoverage===1,authorityDrift:r.authorityDrift}))}
