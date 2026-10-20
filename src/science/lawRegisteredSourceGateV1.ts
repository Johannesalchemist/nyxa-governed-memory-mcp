/** Registry-bound legal-source relevance. Metadata matching is not content attestation. */
import {getLegalPrimarySource} from './lawPrimarySourceRegistryV1.js';
import {assessLawExamSourceRelevance} from './lawExamSourceRelevanceV1.js';

type Use = 'DIRECT'|'ANALOGY'|'BACKGROUND';
type SubmittedSource = {sourceId:string; url:string; sourceRef:string; use:Use};
const policy:Record<string,{normRefs:readonly string[];issueTags:readonly string[]}> = {
 'gg-art-5-expression':{normRefs:['GG Art. 5 Abs. 1','GG Art. 5 Abs. 2'],issueTags:['expression']},
 'gg-art-2-20':{normRefs:['GG Art. 2 Abs. 2','GG Art. 20 Abs. 3'],issueTags:['bodily-integrity','rule-of-law']},
 'bverfg-1bvl1-24':{normRefs:[],issueTags:['forced-medical-treatment','proportionality']}
};
const hold=(reason:string)=>({decision:'HOLD' as const,reason,sourceContentVerified:false,independentExamPassed:false,graduated:false});
export function assessRegisteredLawExamSources(input:{requiredNormRefs:readonly string[];questionIssueTags:readonly string[];sources:readonly SubmittedSource[]}) {
 if(!input.sources.length) return hold('sources_missing');
 const checked=[];
 for(const s of input.sources) {
  if(!Object.hasOwn(policy,s.sourceId))return hold('unregistered_source_id');
  let registry;
  try { registry=getLegalPrimarySource(s.sourceId); }catch{return hold('registry_source_invalid');}
  if(s.url!==registry.url)return hold('registered_url_mismatch');
  if(!s.sourceRef.startsWith(registry.url+'#sha256=')||!/^[0-9a-f]{64}$/.test(s.sourceRef.slice((registry.url+'#sha256=').length)))
   return hold('source_reference_not_bound_to_registry');
  checked.push({sourceId:registry.id,role:registry.role,use:s.use,normRefs:policy[s.sourceId]!.normRefs,issueTags:policy[s.sourceId]!.issueTags});
 }
 const result=assessLawExamSourceRelevance({...input,sources:checked});
 return {...result,sourceContentVerified:false,independentExamPassed:false,graduated:false};
}
