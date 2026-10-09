// NSMF experiment: train on two domains, select meta-relation, test unseen domain.
// Synthetic deterministic simulation, not empirical proof of generalization.
import {writeFileSync} from 'node:fs';
const domains=['LAW','SOFTWARE','PRODUCTION','BIOLOGY','FINANCE','ROBOTICS'];
const relations=['REQUIRES_BEFORE','REGULATED_BY','OBSERVED_BY','CAUSES','PART_OF'];
let seed=20261009;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const examples=[];
for(const domain of domains)for(let i=0;i<120;i++){
 const relation=relations[Math.floor(rand()*relations.length)];
 const evidence=rand()>.18,condition=rand()>.35,transition=rand()>.15;
 const unsafe=relation==='REQUIRES_BEFORE'&&transition&&!condition;
 examples.push({domain,relation,evidence,condition,transition,unsafe});
}
const sourceDomains=['LAW','SOFTWARE'];const train=examples.filter(x=>sourceDomains.includes(x.domain));const test=examples.filter(x=>!sourceDomains.includes(x.domain));
// Candidate discovered from source domains: rank relations by excess unsafe risk.
const scored=relations.map(relation=>{const selected=train.filter(x=>x.relation===relation),other=train.filter(x=>x.relation!==relation);return {relation,excess:selected.filter(x=>x.unsafe).length/selected.length-other.filter(x=>x.unsafe).length/other.length}}).sort((a,b)=>b.excess-a.excess);
const candidate=scored[0].relation;
const baseline=x=>x.domain==='LAW'&&x.relation==='REQUIRES_BEFORE'&&x.transition&&!x.condition;
const transfer=x=>x.relation===candidate&&x.transition&&!x.condition;
const metrics=(items,fn)=>{const tp=items.filter(x=>fn(x)&&x.unsafe).length,fp=items.filter(x=>fn(x)&&!x.unsafe).length,fnn=items.filter(x=>!fn(x)&&x.unsafe).length,tn=items.filter(x=>!fn(x)&&!x.unsafe).length;return{tp,fp,fn:fnn,tn,accuracy:(tp+tn)/items.length,recall:tp/(tp+fnn||1),precision:tp/(tp+fp||1)}};
const perDomain=Object.fromEntries(domains.filter(d=>!sourceDomains.includes(d)).map(d=>[d,{baseline:metrics(test.filter(x=>x.domain===d),baseline),transfer:metrics(test.filter(x=>x.domain===d),transfer)}]));
// Counterexample: semantic similarity alone must not equate regulation with mandatory authorization.
const counterexample={domain:'BIOLOGY',relation:'REGULATED_BY',condition:false,transition:true,unsafe:false};
const negativeControlPassed=!transfer(counterexample);
const out={kind:'NSMF_CROSS_DOMAIN_SYNTHETIC_HOLDOUT',seed:20261009,trainCount:train.length,holdoutCount:test.length,sourceDomains,unseenDomains:domains.filter(d=>!sourceDomains.includes(d)),candidate,relationScores:scored,baseline:metrics(test,baseline),transfer:metrics(test,transfer),perDomain,negativeControlPassed,warning:'Labels generated from same abstract rule as features. This demonstrates schema transfer only, not discovered causal laws.',independentValidation:false,promotionAllowed:false};
writeFileSync('/tmp/nyxa-nsmf-transfer-benchmark.json',JSON.stringify(out,null,2));console.log(JSON.stringify({train:train.length,holdout:test.length,candidate,baseline:out.baseline,transfer:out.transfer,negativeControlPassed,independentValidation:false},null,2));if(!negativeControlPassed||candidate!=='REQUIRES_BEFORE')process.exitCode=1;
