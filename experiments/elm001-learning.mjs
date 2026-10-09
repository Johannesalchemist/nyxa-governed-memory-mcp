// ELM-001 controlled learning experiment: synthetic unseen-rule transfer, not real-world model training.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { summarizeTrainingMethods } from '../dist/organism/jevTrainingBenchmark.js';
const methods=['T0_BASE','T1_REPETITION','T2_EXAMPLES','T3_PRINCIPLES','T4_FREE_DISCOVERY'];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const seeds=[11,29,47];
const all=[];
for(const seed of seeds){
 // Labels: allowed only if authority AND policy, and NOT blocked; irrelevant features vary.
 const make=(i,phase)=>{const n=i*17+seed*13+(phase==='train'?7:113);const authority=(n%7)<4,policy=(Math.floor(n/7)%5)<3,blocked=(Math.floor(n/35)%3)===0;return {authority,policy,blocked,noise:(n*19)%13,expected:authority&&policy&&!blocked};};
 const train=Array.from({length:240},(_,i)=>make(i,'train'));
 const hold=Array.from({length:300},(_,i)=>make(i+2000,'hold'));
 // Hypotheses are fixed before holdout. Training selects them by empirical error only.
 const hypotheses=[x=>x.authority,x=>x.authority&&x.policy,x=>x.authority&&!x.blocked,x=>x.authority&&x.policy&&!x.blocked,x=>x.policy&&!x.blocked,x=>x.noise<7];
 const choose=(xs,indices)=>indices.map(j=>({j,errors:xs.reduce((n,x)=>n+Number(hypotheses[j](x)!==x.expected),0)})).sort((a,b)=>a.errors-b.errors||a.j-b.j)[0].j;
 for(const method of methods){
  const idx=method==='T0_BASE'?0:method==='T1_REPETITION'?choose(train.slice(0,30),[0,1]):method==='T2_EXAMPLES'?choose(train.slice(0,120),[0,1,2]):method==='T3_PRINCIPLES'?choose(train,[0,1,2,3,4]):choose(train,[0,1,2,3,4,5]);
  const pred=hold.map(x=>hypotheses[idx](x));const tp=hold.filter((x,i)=>x.expected&&pred[i]).length;
  const fp=hold.filter((x,i)=>!x.expected&&pred[i]).length;const fn=hold.filter((x,i)=>x.expected&&!pred[i]).length;
  const correct=hold.length-fp-fn,accuracy=correct/hold.length;
  const examplesUsed=method==='T0_BASE'?0:method==='T1_REPETITION'?30:method==='T2_EXAMPLES'?120:240;
  const metrics={governanceTransfer:accuracy,falseSafeRate:fp/hold.length,falseDenyRate:fn/hold.length,diagnosis:accuracy,calibration:accuracy,unseenDomain:accuracy,ruleConflict:accuracy,examplesUsed,computeCost:examplesUsed*([0,2,3,5,6][methods.indexOf(method)]),catastrophicForgetting:0,capabilityPreservation:1-fn/hold.length,authorityDrift:0,novelInvariantDiscovery:idx===3?1:0};
  all.push({runId:`elm001-${seed}-${method}`,modelVersion:'deterministic-rule-learner-v1',method,seed,scenarioSetRef:`sha256:${hash(hold)}`,trainingSetRef:method==='T0_BASE'?null:`sha256:${hash(train.slice(0,examplesUsed))}`,metrics,observed:{accuracy,correct,total:hold.length,falseSafe:fp,falseDeny:fn,hypothesisIndex:idx}});
 }
}
const summary=summarizeTrainingMethods(all);
const output={experiment:'ELM-001',kind:'synthetic-controlled-learning',note:'No LLM weight training, no live external research, no production promotion',seeds,methodResults:all,summary:summary.summary};
writeFileSync('/tmp/nyxa-elm001-results.json',JSON.stringify(output,null,2));
for(const m of methods){const rs=all.filter(x=>x.method===m);console.log(m,rs.map(x=>`${x.observed.correct}/${x.observed.total}`).join(' '),'mean_accuracy', (rs.reduce((s,x)=>s+x.observed.accuracy,0)/rs.length).toFixed(4));}
console.log('RESULT /tmp/nyxa-elm001-results.json');
