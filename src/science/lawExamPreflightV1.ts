/** Non-mutating Jura pre-exam gate. Hash matching is not independent content verification. */
import {assessRegisteredLawExamSources} from './lawRegisteredSourceGateV1.js';
type Attestation={sourceId:string;digest:string;verified:boolean;verifierId?:string;attestationRef?:string};
type Input=Parameters<typeof assessRegisteredLawExamSources>[0] & {contentAttestations?:readonly Attestation[]};
/** Human-accepted research supports teaching, never certification. */
export function preflightLawTeaching(input:Input & {researchAcceptance?:{accepted:boolean;acceptedBy:string;reference:string}}){
 const relevance=assessRegisteredLawExamSources(input);
 if(relevance.decision!=='RELEVANCE_CANDIDATE')return {...relevance,teachingReady:false};
 const a=input.researchAcceptance;
 if(!a?.accepted||!a.acceptedBy?.trim()||!a.reference?.trim())return {...relevance,decision:'HOLD' as const,reason:'research_acceptance_missing',teachingReady:false};
 return {...relevance,decision:'RESEARCH_TEACHING' as const,reason:'human_accepted_research_sources',teachingReady:true,sourceContentVerified:false,independentExamPassed:false,graduated:false};
}
export function preflightLawExam(input:Input){
 const relevance=assessRegisteredLawExamSources(input);
 if(relevance.decision!=='RELEVANCE_CANDIDATE')return {...relevance,examReady:false};
 const ids=new Set(input.sources.map(s=>s.sourceId));
 const attest=input.contentAttestations??[];
 if(attest.length!==ids.size||new Set(attest.map(a=>a.sourceId)).size!==ids.size||attest.some(a=>!ids.has(a.sourceId)||!a.verified||!/^[a-f0-9]{64}$/.test(a.digest)))
  return {decision:'HOLD' as const,reason:'content_attestation_missing',examReady:false};
 for(const a of attest){
  const source=input.sources.find(s=>s.sourceId===a.sourceId);
  if(!source||source.sourceRef!==source.url+'#sha256='+a.digest)
   return {decision:'HOLD' as const,reason:'content_digest_reference_mismatch',examReady:false};
 }
 if(attest.some(a=>!a.verifierId?.trim()||!a.attestationRef?.trim()))
  return {decision:'HOLD' as const,reason:'independent_verifier_evidence_missing',examReady:false};
 return {decision:'CONTENT_ATTESTATION_CANDIDATE' as const,reason:'attestation_claims_require_external_verification_and_examiner',examReady:false};
}
