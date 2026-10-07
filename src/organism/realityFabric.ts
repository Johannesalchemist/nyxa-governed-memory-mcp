export type RealityFabricDomain='NYXA'|'JEV'|'SILICON'|'BIOGENETIC';
export type RealityFabricLayer='SEMANTIC'|'EXPERIENCE'|'SIMULATION'|'PRESENCE'|'MATTER'|'ROBOTICS';
export type RealityTruth='HYPOTHESIS'|'SIMULATED'|'OBSERVED'|'BUILT'|'MEASURED'|'VERIFIED';
export type RealityTransition={id:string;domain:RealityFabricDomain;from:RealityFabricLayer;to:RealityFabricLayer;truth:RealityTruth;evidenceRefs:readonly string[];authorityEffect:'NONE';liveEffect:boolean};
export function gateRealityTransition(x:RealityTransition){
 const reasons:string[]=[];
 if(!x.id.trim())reasons.push('transition_id_missing');
 if((x.truth==='OBSERVED'||x.truth==='BUILT'||x.truth==='MEASURED'||x.truth==='VERIFIED')&&!x.evidenceRefs.length)reasons.push('reality_evidence_missing');
 if(x.liveEffect)reasons.push('live_effect_requires_external_governance');
 if(x.authorityEffect!=='NONE')reasons.push('authority_escalation');
 return{eligible:reasons.length===0,reasons,authorityEffect:'NONE' as const};
}
export const realityFabricInvariant={
 informationIsNotMatter:true,simulationIsNotReality:true,capabilityIsNotAuthority:true,evidenceRequiredForRealityClaims:true,
 crossLayerAuthorityInheritance:false,autonomousLiveActivation:false,
 layers:['SEMANTIC','EXPERIENCE','SIMULATION','PRESENCE','MATTER','ROBOTICS'] as RealityFabricLayer[],
 domains:['NYXA','JEV','SILICON','BIOGENETIC'] as RealityFabricDomain[]
} as const;
