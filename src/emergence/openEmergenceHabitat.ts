/** Open Emergence Habitat V0: proposal and observation only; never mutates runtime authority. */
import { createHash } from 'node:crypto';
export type EvolutionDomain = 'memory' | 'dreaming' | 'semantics' | 'collective_self_model' | 'world_twin';
export type EvidenceKind = 'observed' | 'inferred' | 'independently_checked';
export type HabitatObservation = Readonly<{id:string; islandId:string; domain:EvolutionDomain; kind:EvidenceKind; claim:string; sourceIds:readonly string[]; atMs:number}>;
export type HabitatProposal = Readonly<{id:string; domain:EvolutionDomain; hypothesis:string; evidenceIds:readonly string[]; experiment:string; rollback:string; requestedCapabilities:readonly string[]}>;
export type HabitatReview = Readonly<{status:'PARK'|'READY_FOR_SANDBOX'; reason:string; proposalId:string; evidenceDigest:string; authorityGranted:false}>;
const id = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
/** Distinct islands are not necessarily independent evidence: source lineage must also differ. */
export function reviewHabitatProposal(p:HabitatProposal, observations:readonly HabitatObservation[]):HabitatReview {
 const park=(reason:string):HabitatReview=>({status:'PARK',reason,proposalId:p?.id??'',evidenceDigest:'',authorityGranted:false});
 if (!p || !id.test(p.id) || !p.hypothesis?.trim() || !p.experiment?.trim() || !p.rollback?.trim() || !Array.isArray(p.evidenceIds) || !Array.isArray(p.requestedCapabilities) || p.evidenceIds.length>64 || observations.length>256) return park('invalid_proposal');
 if (p.requestedCapabilities.length) return park('capability_escalation_requires_separate_governance');
 const byId=new Map(observations.filter(o=>id.test(o.id)&&id.test(o.islandId)&&Array.isArray(o.sourceIds)&&o.sourceIds.every(s=>id.test(s))&&Number.isSafeInteger(o.atMs)&&o.atMs>=0).map(o=>[o.id,o]));
 if (!p.evidenceIds.length || p.evidenceIds.some(e=>!byId.has(e))) return park('missing_evidence');
 const selected=p.evidenceIds.map(e=>byId.get(e)!);
 if (selected.some(o=>o.domain!==p.domain)) return park('domain_mismatch');
 if (!selected.some(o=>o.kind==='observed')) return park('observation_required');
 const lineage=new Set(selected.flatMap(o=>o.sourceIds));
 if (!lineage.size) return park('source_lineage_required');
 const digest=createHash('sha256').update(JSON.stringify([...new Set(p.evidenceIds)].sort().map(e=>byId.get(e)))).digest('hex');
 return {status:'READY_FOR_SANDBOX',reason:'review_only_no_execution',proposalId:p.id,evidenceDigest:digest,authorityGranted:false};
}
