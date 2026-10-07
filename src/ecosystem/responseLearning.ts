import type {EntityTwin,EvidenceRef} from './entityTwin.js'; import {addEvidence} from './learning.js';
export type ResponseOutcome='POSITIVE'|'NEGATIVE'|'NEUTRAL'|'INTRODUCTION'|'COMMITMENT';
export interface ResponseEvidence {id:string;outcome:ResponseOutcome;source:string;observedAt:string;confidence:number}
export function learnFromResponse(t:EntityTwin,r:ResponseEvidence):EntityTwin{if(!r.source||!r.observedAt)throw new Error('RESPONSE_PROVENANCE_REQUIRED'); const e:EvidenceRef={id:r.id,state:'OBSERVED',confidence:r.confidence,source:r.source,observedAt:r.observedAt}; const n=addEvidence(t,e); return {...n,attributes:{...n.attributes,lastResponse:r.outcome}}}
