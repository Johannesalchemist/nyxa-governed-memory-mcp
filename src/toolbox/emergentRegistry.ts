export type Modality='VISION'|'AUDIO'|'SPATIAL'|'THERMAL'|'RADAR'|'CHEMICAL'|'SCENT'|'TOUCH'|'BIOSIGNAL'|'SEMANTIC'|'UNKNOWN';
export type CapabilityStage='DISCOVERED'|'DESCRIBED'|'SANDBOXED'|'SIMULATED'|'VERIFIED'|'ELIGIBLE';
export type ChannelDirection='OBSERVE'|'EFFECT'|'BIDIRECTIONAL';
export type EmergentCapabilityDescriptor={id:string;version:string;modality:Modality;direction:ChannelDirection;stage:CapabilityStage;inputSchema:Readonly<Record<string,unknown>>;outputSchema:Readonly<Record<string,unknown>>;provenanceRef:string|null;evidenceContract:readonly string[];authorityRequirement:string;effectRadius:string;safetyEnvelope:readonly string[];latencyMs:number|null;confidence:number|null;components?:readonly string[]};
const rank:Record<CapabilityStage,number>={DISCOVERED:0,DESCRIBED:1,SANDBOXED:2,SIMULATED:3,VERIFIED:4,ELIGIBLE:5};
export function assessEmergentCapability(c:EmergentCapabilityDescriptor){
 const reasons:string[]=[];
 if(!/^[a-z][a-z0-9_.-]+$/.test(c.id))reasons.push('invalid_identity');
 if(!c.version.trim())reasons.push('version_missing');
 if(!c.authorityRequirement.trim())reasons.push('authority_contract_missing');
 if(!c.effectRadius.trim())reasons.push('effect_radius_missing');
 if(c.latencyMs!==null&&(!Number.isFinite(c.latencyMs)||c.latencyMs<0))reasons.push('invalid_latency');
 if(c.confidence!==null&&(!Number.isFinite(c.confidence)||c.confidence<0||c.confidence>1))reasons.push('invalid_confidence');
 if(rank[c.stage]>=rank.VERIFIED&&(!c.provenanceRef||!c.evidenceContract.length))reasons.push('verification_evidence_missing');
 if(c.direction!=='OBSERVE'&&rank[c.stage]>=rank.ELIGIBLE&&!c.safetyEnvelope.length)reasons.push('effect_safety_envelope_missing');
 return{accepted:reasons.length===0,reasons,authorityEffect:'NONE' as const,executable:false as const};
}
export function composeVirtualCapability(id:string,parts:readonly EmergentCapabilityDescriptor[]):EmergentCapabilityDescriptor{
 if(parts.length<2)throw Error('composition_requires_multiple_channels');
 const stage=parts.every(x=>rank[x.stage]>=rank.VERIFIED)?'SIMULATED':'SANDBOXED';
 return{id,version:'0.1.0',modality:'UNKNOWN',direction:'OBSERVE',stage,inputSchema:{type:'object'},outputSchema:{type:'object'},provenanceRef:null,evidenceContract:['independent_component_provenance','fusion_validation'],authorityRequirement:'NONE',effectRadius:'OBSERVATION_ONLY',safetyEnvelope:[],latencyMs:null,confidence:null,components:parts.map(x=>x.id)};
}
export class EmergentToolboxRegistry{
 private channels=new Map<string,EmergentCapabilityDescriptor>();
 register(c:EmergentCapabilityDescriptor){const a=assessEmergentCapability(c);if(!a.accepted)throw Error(a.reasons.join(','));if(this.channels.has(c.id))throw Error('duplicate_emergent_capability');this.channels.set(c.id,Object.freeze({...c}));return a}
 list(){return[...this.channels.values()]}
 describe(id:string){return this.channels.get(id)??null}
}
export const emergentToolbox=new EmergentToolboxRegistry();
