// Fail-closed evidence gate: source quotes alone cannot justify legal conclusions.
import {readFileSync,writeFileSync} from 'node:fs';
const prior=JSON.parse(readFileSync('/tmp/nyxa-law-school-subsumption.json','utf8'));
const review=(item)=>{
 const gaps=[];
 if(!item.sourceCitation?.exactText||!item.sourceCitation?.sourceSha256)gaps.push('official_norm_source_missing');
 if(!item.justificationAssessed)gaps.push('legal_justification_unassessed');
 if(!item.proportionalityAssessed)gaps.push('proportionality_unassessed');
 if(!item.independentCaseLawVerified)gaps.push('case_law_unverified');
 if(!item.humanLegalReview)gaps.push('independent_legal_review_missing');
 return {id:item.id,gaps,releaseAllowed:gaps.length===0};
};
const cases=prior.outputs.map(review);
const negativeControls=[
 {id:'CONTROL_NO_SOURCE',sourceCitation:null,justificationAssessed:true,proportionalityAssessed:true,independentCaseLawVerified:true,humanLegalReview:true},
 {id:'CONTROL_ONLY_SOURCE',sourceCitation:prior.outputs[0].sourceCitation,justificationAssessed:false,proportionalityAssessed:false,independentCaseLawVerified:false,humanLegalReview:false}
].map(review);
const out={kind:'LEGAL_EVIDENCE_RELEASE_GATE',total:cases.length,blocked:cases.filter(x=>!x.releaseAllowed).length,negativeControlsBlocked:negativeControls.filter(x=>!x.releaseAllowed).length,negativeControlsTotal:negativeControls.length,items:cases,negativeControls,promotionAllowed:false};
writeFileSync('/tmp/nyxa-law-school-evidence-gate.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({total:out.total,blocked:out.blocked,negativeControlsBlocked:out.negativeControlsBlocked,negativeControlsTotal:out.negativeControlsTotal,exampleGaps:cases[0].gaps},null,2));
if(out.blocked!==out.total||out.negativeControlsBlocked!==out.negativeControlsTotal)process.exitCode=1;
