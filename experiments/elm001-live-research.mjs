// Live-source evidence boundary probe. No model training or content validation.
import {researchBridge} from '../dist/epistemic/researchBridge.js';
import {writeFileSync} from 'node:fs';
const articles=[1,2,3,4,5,6,7,8,9,10];
const results=[];
for(const article of articles){
 const url=`https://www.gesetze-im-internet.de/gg/art_${article}.html`;
 try{
  const r=await researchBridge({claim_id:`elm-gg-${article}`,statement:`Retrieve authoritative primary source for German Basic Law Article ${article}`,evidence_strength:0.1,provenance_quality:0.1,impact_score:0.9},[url]);
  results.push({article,source:url,provenance:r.outcome.evidence_graph?.provenance_refs??[],stop:r.outcome.stopping_reason,authority:r.epistemic_authority,promotion:r.promotion_allowed});
 }catch(e){results.push({article,source:url,error:String(e),authority:'NONE',promotion:false});}
}
writeFileSync('/tmp/nyxa-elm001-live-results.json',JSON.stringify({kind:'live-retrieval-boundary-probe',results},null,2));
console.log(JSON.stringify({total:results.length,retrieved:results.filter(x=>x.provenance?.length).length,unauthorizedPromotion:results.filter(x=>x.promotion!==false).length,stops:[...new Set(results.map(x=>x.stop))],errors:results.filter(x=>x.error)},null,2));
