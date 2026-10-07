import type { EvidenceRef } from './entityTwin.js';
export interface RelationshipVector { from:string; to:string; complementarity:number; technicalOverlap:number; competition:number; mentorship:number; trust:number; influence:number; introductionPower:number; knowledgeFlow:number; capitalAccess:number; authorityAccess:number; dependency:number; ipRisk:number; strategicOptionality:number; evidence:EvidenceRef[] }
export const clamp=(n:number)=>Math.max(-1,Math.min(1,n));
export function relationshipSignal(r:RelationshipVector){return clamp(.22*r.complementarity+.14*r.mentorship+.10*r.trust+.10*r.introductionPower+.10*r.knowledgeFlow+.10*r.capitalAccess+.08*r.authorityAccess+.08*r.strategicOptionality-.12*r.competition-.10*r.ipRisk-.06*r.dependency)}
export function competitionRisk(r:RelationshipVector){return clamp(.55*r.competition+.30*r.technicalOverlap+.15*r.ipRisk)}
