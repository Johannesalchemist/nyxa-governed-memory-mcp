import {buildOrganismSignal,type OrganismSignalEnvelope} from '../organism/signalEnvelope.js';
import {routeOrganismSignal} from '../organism/reflex.js';
import type {FailureObservation,PatternCandidate} from './crossDomainFailureGenome.js';
export type WorldTwinQuestionReason='CROSS_DOMAIN_PATTERN'|'NON_REPRODUCTION'|'DOMAIN_CONTRADICTION'|'TRANSFER_CHALLENGE';
export type WorldTwinQuestionCandidate={id:string;reason:WorldTwinQuestionReason;question:string;evidenceRefs:readonly string[];sourceDomains:readonly string[];signal:OrganismSignalEnvelope;route:'DISCOVERY';authorityEffect:'NONE'};
const mk=(reason:WorldTwinQuestionReason,question:string,refs:string[],domains:string[]):WorldTwinQuestionCandidate=>{const signal=buildOrganismSignal({kind:'QUESTION',producer:'jev',truthState:'PROPOSED',subject:question,payload:{reason,domains},provenanceRefs:refs,parentSignalIds:[]});const route=routeOrganismSignal(signal);if(route.route!=='DISCOVERY')throw Error('question_not_routed_to_discovery');return{id:signal.id,reason,question,evidenceRefs:refs,sourceDomains:domains,signal,route:'DISCOVERY',authorityEffect:'NONE'}};
export function questionsFromSystemLawLab(observations:readonly FailureObservation[],patterns:readonly PatternCandidate[]):WorldTwinQuestionCandidate[]{const out:WorldTwinQuestionCandidate[]=[];
 for(const p of patterns){const xs=observations.filter(x=>x.failureClass===p.failureClass);const yes=xs.filter(x=>x.reproduced&&x.evidenceRef);const no=xs.filter(x=>!x.reproduced);const domains=[...new Set(yes.map(x=>x.domain))];const refs=yes.flatMap(x=>x.evidenceRef?[x.evidenceRef]:[]);
 if(p.candidateInvariant)out.push(mk('CROSS_DOMAIN_PATTERN',`Why does ${p.failureClass} transfer across ${p.domainCoverage} domains, and what causal structure is shared?`,refs,domains));
 if(yes.length&&no.length)out.push(mk('NON_REPRODUCTION',`Why is ${p.failureClass} reproduced in some twins but resisted in others, and is the difference causal and transferable?`,refs,[...new Set(xs.map(x=>x.domain))]));
 if(p.requiresForeignDomainChallenge&&p.candidateInvariant)out.push(mk('TRANSFER_CHALLENGE',`Which maximally different domain can falsify the candidate invariant for ${p.failureClass}?`,refs,domains));
 }return out}
export const scientificWorldTwinLoop={roles:['OBSERVATION','QUESTION_DISCOVERY','HYPOTHESIS','EXPERIMENT','SIMULATION','COMPARISON','EVIDENCE','LEARNING'] as const,systemLawLabIsPipeline:true,questionsFeedDiscovery:true,resultsFeedLearning:true,authorityEffect:'NONE' as const};
