// Experimental parallel learning orchestration, read-only; no production promotion.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const cases=JSON.parse(readFileSync('/tmp/nyxa-law-school-subsumption.json','utf8')).outputs;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const lanes={
 knowledge: async c=>({sourceVerified:!!c.sourceCitation?.sourceSha256,source:c.sourceCitation?.url??null}),
 application:async c=>({elementsMatched:c.elements.filter(e=>e.found).length,totalElements:c.elements.length,legalConclusion:'UNDETERMINED'}),
 challenge:async c=>({unverifiedCaseLaw:!c.independentCaseLawVerified,justificationMissing:!c.justificationAssessed}),
 feedback:async c=>({candidateOnly:true,improvementUnproven:true}),
 governance:async c=>({promotionAllowed:false,authority:'NONE',independentReviewMissing:!c.humanLegalReview})
};
const run=async(mode)=>{const start=process.hrtime.bigint();const results=[];for(const c of cases){const entries=mode==='parallel'?await Promise.all(Object.entries(lanes).map(async ([lane,fn])=>[lane,await fn(c)])):await (async()=>{const a=[];for(const [lane,fn] of Object.entries(lanes))a.push([lane,await fn(c)]);return a})();results.push({caseId:c.id,competencyId:`LAW.GG.ART${c.article}`,schema:'NYXA_NSI_LEARNING_EVIDENCE_EXPERIMENT_V0',lanes:Object.fromEntries(entries),sourceHash:c.sourceCitation?.sourceSha256??null,authority:'NONE',promotionAllowed:false});}return{mode,elapsedMs:Number(process.hrtime.bigint()-start)/1e6,results};};
const serial=await run('serial'),parallel=await run('parallel');
const comparable=x=>x.results.map(r=>({caseId:r.caseId,lanes:r.lanes,sourceHash:r.sourceHash}));
const same=hash(comparable(serial))===hash(comparable(parallel));
const out={kind:'PARALLEL_LEARNING_FABRIC_SMOKE_TEST',note:'Five lightweight asynchronous lanes; timings are not meaningful throughput benchmarks, no real model training',caseCount:cases.length,laneCount:Object.keys(lanes).length,serialMs:serial.elapsedMs,parallelMs:parallel.elapsedMs,outputsEquivalent:same,allBlocked:parallel.results.every(x=>!x.promotionAllowed&&x.authority==='NONE'),nsiCompatibility:'PROPOSED_ADAPTER_ONLY',results:parallel.results};
writeFileSync('/tmp/nyxa-parallel-learning-smoke.json',JSON.stringify(out,null,2));console.log(JSON.stringify({caseCount:out.caseCount,laneCount:out.laneCount,outputsEquivalent:same,allBlocked:out.allBlocked,nsiCompatibility:out.nsiCompatibility},null,2));if(!same||!out.allBlocked)process.exitCode=1;
