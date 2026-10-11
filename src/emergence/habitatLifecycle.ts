/** NYXA Habitat lifecycle: deterministic advisory bridge, never executes proposals. */
import {createHash} from 'node:crypto';
import {reviewHabitatProposal, type HabitatObservation, type HabitatProposal} from './openEmergenceHabitat.js';
import {selectDreamMode, type DreamFeedback} from '../cognitive/jevDreamController.js';
import {evaluateLearningRatchet, type RatchetInput} from '../organism/learningRatchet.js';
export type HabitatLifecycleInput=Readonly<{proposal:HabitatProposal;observations:readonly HabitatObservation[];dream:{events:number;budget:number;modelAvailable:boolean;history:readonly DreamFeedback[]};ratchet?:RatchetInput}>;
export function evaluateHabitatLifecycle(input:HabitatLifecycleInput){
 const review=reviewHabitatProposal(input.proposal,input.observations);
 const dream=selectDreamMode({events:input.dream.events,budget:input.dream.budget,modelAvailable:input.dream.modelAvailable},input.dream.history);
 const ratchet=input.ratchet?evaluateLearningRatchet(input.ratchet):null;
 const eligible=review.status==='READY_FOR_SANDBOX' && dream.mode!==null;
 const outcome=!eligible?'PARK':ratchet?.outcome==='RETAIN_CANDIDATE'?'RETAIN_FOR_GOVERNANCE':'AWAIT_SANDBOX_EVIDENCE';
 const record={schema:'nyxa.emergence.lifecycle.v0',proposalId:input.proposal.id,domain:input.proposal.domain,review,dream,ratchet,outcome,authorityGranted:false,executed:false,integrated:false};
 return {...record,receiptDigest:createHash('sha256').update(JSON.stringify(record)).digest('hex')};
}
