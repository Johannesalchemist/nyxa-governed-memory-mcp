export type EpistemicState='OBSERVED'|'REPORTED'|'INFERRED'|'SIMULATED'|'HYPOTHESIZED'|'VERIFIED'|'STALE'|'CONFLICTING';
export type EntityKind='PERSON'|'ORGANIZATION'|'INVESTOR'|'MENTOR'|'AUTHORITY'|'COUNTRY'|'PROGRAM'|'TECHNOLOGY'|'PRODUCT'|'PROJECT'|'MARKET'|'OTHER';
export interface EvidenceRef { id:string; state:EpistemicState; confidence:number; source?:string; observedAt?:string }
export interface EntityTwin { id:string; kind:EntityKind; name:string; capabilities:string[]; goals:string[]; constraints:string[]; resources:string[]; evidence:EvidenceRef[]; attributes:Record<string,number|string|boolean> }
export function evidenceConfidence(t:EntityTwin){const usable=t.evidence.filter(e=>!['SIMULATED','HYPOTHESIZED','STALE','CONFLICTING'].includes(e.state)); return usable.length?usable.reduce((s,e)=>s+Math.max(0,Math.min(1,e.confidence)),0)/usable.length:0}
