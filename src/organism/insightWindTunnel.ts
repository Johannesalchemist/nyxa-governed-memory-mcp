export type InsightDomain='SYSTEM_ARCHITECTURE'|'SIMULATION_DESIGN'|'CHIP_ARCHITECTURE'|'BUILT_ENVIRONMENT'|'ENERGY_SYSTEMS'|'ROBOTICS'|'CCAM'|'MATERIALS'|'BIOENGINEERING'|'BUSINESS_PRODUCTION';
export type CognitiveArm='JEV_ONLY'|'JEV_QWEN7B'|'JEV_CLAUDE'|'JEV_KIMI'|'JEV_GEMINI_FLASH'|'JEV_ASTRA'|'JEV_FRONTIER'|'JEV_DYNAMIC';
export type InsightRun={runId:string;domain:InsightDomain;arm:CognitiveArm;scenarioRef:string;seed:number;hypotheses:number;novelHypotheses:number;causalDepth:number;crossDomainLinks:number;experimentDesigns:number;disconfirmingTests:number;uncertaintiesExposed:number;redTeamFindings:number;simulationCandidates:number;evidenceConfirmed:number;evidenceRejected:number;objectiveGain:number;latencyMs:number;computeCost:number;authorityDrift:number;provenanceCoverage:number};
export type InsightScore={runId:string;domain:InsightDomain;arm:CognitiveArm;breadth:number;depth:number;epistemicQuality:number;verifiedYield:number;cognitiveLift:number;liftPerCost:number;eligible:boolean;reasons:readonly string[]};
const domains:readonly InsightDomain[]=['SYSTEM_ARCHITECTURE','SIMULATION_DESIGN','CHIP_ARCHITECTURE','BUILT_ENVIRONMENT','ENERGY_SYSTEMS','ROBOTICS','CCAM','MATERIALS','BIOENGINEERING','BUSINESS_PRODUCTION'];
const arms:readonly CognitiveArm[]=['JEV_ONLY','JEV_QWEN7B','JEV_CLAUDE','JEV_KIMI','JEV_GEMINI_FLASH','JEV_ASTRA','JEV_FRONTIER','JEV_DYNAMIC'];
const finite=(n:number)=>Number.isFinite(n)&&n>=0;
export function scoreInsightRun(r:InsightRun,baseline?:InsightRun):InsightScore{
 const reasons:string[]=[]; if(!r.scenarioRef.trim())reasons.push('scenario_ref_missing'); if(r.authorityDrift>0)reasons.push('authority_drift');
 for(const [k,v] of Object.entries(r))if(typeof v==='number'&&!finite(v))reasons.push('metric_invalid:'+k);
 if(r.provenanceCoverage<0||r.provenanceCoverage>1)reasons.push('provenance_invalid');
 const breadth=r.novelHypotheses+r.crossDomainLinks+r.experimentDesigns+r.simulationCandidates;
 const depth=r.causalDepth+r.disconfirmingTests+r.redTeamFindings;
 const epistemicQuality=r.uncertaintiesExposed+r.evidenceConfirmed-r.evidenceRejected+2*r.provenanceCoverage;
 const verifiedYield=r.evidenceConfirmed+Math.max(0,r.objectiveGain);
 const base=baseline?(baseline.evidenceConfirmed+Math.max(0,baseline.objectiveGain)):0;
 const cognitiveLift=verifiedYield-base;
 return{runId:r.runId,domain:r.domain,arm:r.arm,breadth,depth,epistemicQuality,verifiedYield,cognitiveLift,liftPerCost:cognitiveLift/(1+r.computeCost+r.latencyMs/1000),eligible:reasons.length===0,reasons};
}
export function insightWindTunnelMatrix(runs:readonly InsightRun[]){
 const byKey=(d:InsightDomain,a:CognitiveArm)=>runs.filter(r=>r.domain===d&&r.arm===a);
 return domains.flatMap(domain=>{const bases=byKey(domain,'JEV_ONLY');const base=bases[0];return arms.map(arm=>{const xs=byKey(domain,arm).map(r=>scoreInsightRun(r,base));const ok=xs.filter(x=>x.eligible);const mean=(k:keyof Pick<InsightScore,'cognitiveLift'|'liftPerCost'|'breadth'|'depth'|'epistemicQuality'>)=>ok.length?ok.reduce((s,x)=>s+x[k],0)/ok.length:null;return{domain,arm,n:ok.length,meanCognitiveLift:mean('cognitiveLift'),meanLiftPerCost:mean('liftPerCost'),meanBreadth:mean('breadth'),meanDepth:mean('depth'),meanEpistemicQuality:mean('epistemicQuality')}})})}
export const insightWindTunnelProtocol={domains,arms,principles:['same_scenario_same_seed','blind_scoring','evidence_before_credit','disconfirmation_required','unknowns_rewarded','authority_effect_none','frontier_output_is_hypothesis_not_fact'] as const,authorityEffect:'NONE' as const};
