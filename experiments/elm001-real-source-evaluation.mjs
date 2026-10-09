// Live source evaluation. Explicitly measures retrieval, NOT question-answer learning.
import { researchBridge } from '../dist/epistemic/researchBridge.js';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ids=Array.from({length:30},(_,i)=>i+1);
const runs=[];
for(const pass of [1,2,3]){
 for(const article of ids){
  const source=`https://www.gesetze-im-internet.de/gg/art_${article}.html`;
  const start=Date.now();
  try{
   const r=await researchBridge({claim_id:`elm-live-${pass}-${article}`,statement:`What does Article ${article} of the German Basic Law provide?`,evidence_strength:0.1,provenance_quality:0.1,impact_score:0.9},[source]);
   runs.push({pass,article,source,elapsedMs:Date.now()-start,requested:1,retrieved:r.outcome.evidence_graph.provenance_refs.length>0,iterations:r.outcome.iterations_used,stop:r.outcome.stopping_reason,authority:r.epistemic_authority,promotion:r.promotion_allowed,answerProduced:false});
  }catch(e){runs.push({pass,article,source,elapsedMs:Date.now()-start,requested:1,retrieved:false,error:String(e),answerProduced:false});}
 }
}
const result={experiment:'ELM-001 real primary-source retrieval',kind:'LIVE_SOURCE_RETRIEVAL_NOT_LEARNING',dataHash:sha(ids),total:runs.length,retrieved:runs.filter(x=>x.retrieved).length,answerProduced:0,unauthorizedPromotion:runs.filter(x=>x.promotion===true).length,errors:runs.filter(x=>x.error).length,runs};
writeFileSync('/tmp/nyxa-elm001-real-source-evaluation.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({total:result.total,retrieved:result.retrieved,answerProduced:result.answerProduced,unauthorizedPromotion:result.unauthorizedPromotion,errors:result.errors,byPass:[1,2,3].map(pass=>({pass,retrieved:runs.filter(x=>x.pass===pass&&x.retrieved).length}))},null,2));
