// NSI-MR v0 semantic contract probe. Explicit distinctions prevent invalid cross-domain inference.
import {writeFileSync} from 'node:fs';
const relations=new Set(['REQUIRES_BEFORE','REGULATED_BY','SUPPORTS','CONTRADICTS','ANALOGOUS_TO']);
const valid=x=>x.schema==='NSI-MR/0'&&typeof x.id==='string'&&typeof x.domain==='string'&&relations.has(x.relation)&&typeof x.subject==='string'&&typeof x.object==='string'&&['OBSERVATION','HYPOTHESIS','VERIFIED'].includes(x.epistemic)&&typeof x.context==='string'&&typeof x.evidence==='string'&&typeof x.authority==='string';
const inferTransfer=(a,b)=>({analogy:a.relation===b.relation&&a.subject!==b.subject,proof:false,requiresForeignDomainValidation:true,authorityEffect:'NONE'});
const base={schema:'NSI-MR/0',id:'law-1',domain:'LAW',relation:'REQUIRES_BEFORE',subject:'administrative_action',object:'legal_justification',epistemic:'HYPOTHESIS',context:'synthetic',evidence:'synthetic:law-1',authority:'NONE'};
const other={...base,id:'software-1',domain:'SOFTWARE',subject:'privileged_action',object:'authorization',evidence:'synthetic:software-1'};
const tests=[
 {name:'well_formed',pass:valid(base)},
 {name:'reject_unknown_relation',pass:!valid({...base,relation:'MAGICALLY_CAUSES'})},
 {name:'reject_missing_context',pass:!valid({...base,context:undefined})},
 {name:'reject_missing_evidence',pass:!valid({...base,evidence:undefined})},
 {name:'analogy_not_proof',pass:inferTransfer(base,other).analogy&&!inferTransfer(base,other).proof},
 {name:'same_domain_not_automatically_transfer',pass:!inferTransfer(base,{...base}).analogy}
];
const out={schema:'NSI-MR/0',kind:'LINGUA_SEMANTIC_CONTRACT_TEST',tests,passed:tests.filter(x=>x.pass).length,total:tests.length,example:base,transfer:inferTransfer(base,other),status:'EXPERIMENTAL_NOT_PRODUCTION',promotionAllowed:false};
writeFileSync('/tmp/nyxa-lingua-contract.json',JSON.stringify(out,null,2));console.log(JSON.stringify({passed:out.passed,total:out.total,transfer:out.transfer,status:out.status},null,2));if(out.passed!==out.total)process.exitCode=1;
