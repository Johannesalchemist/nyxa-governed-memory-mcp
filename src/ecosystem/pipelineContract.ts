import type {EntityTwin} from './entityTwin.js'; import type {RelationshipVector} from './relationships.js';
export type PipelineStage='DISCOVERED'|'ENRICHED'|'TWINNED'|'SIMULATED'|'OUTREACH_PREPARED'|'AWAITING_APPROVAL'|'CONTACTED'|'RESPONDED'|'COMMITTED'|'PROPOSAL_READY';
export interface EcosystemPipelineRecord {caseId:string;entity:EntityTwin;relationships:RelationshipVector[];stage:PipelineStage;proposalId?:string;approvalRef?:string;lastEvidenceId?:string}
export function outboundAllowed(r:EcosystemPipelineRecord){return r.stage==='AWAITING_APPROVAL'&&Boolean(r.approvalRef)}
export function advance(r:EcosystemPipelineRecord,next:PipelineStage):EcosystemPipelineRecord{const external=['CONTACTED','COMMITTED']; if(external.includes(next)&&!r.approvalRef)throw new Error('HUMAN_APPROVAL_REQUIRED'); return {...r,stage:next}}
