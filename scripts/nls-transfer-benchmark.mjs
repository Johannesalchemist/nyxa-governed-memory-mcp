import {evaluateSemanticTransfer} from '../dist/semantic/transferGate.js';
import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
// Deterministic, synthetic cross-domain transfer experiment. No real scientific truth claims.
const domains=['SYSTEM_ARCHITECTURE','SIMULATION_DESIGN','CHIP_ARCHITECTURE','BUILT_ENVIRONMENT','ENERGY_SYSTEMS','ROBOTICS','CCAM','MATERIALS','BIOENGINEERING','BUSINESS_PRODUCTION'];
const rules=[0,0,0,1,1,1,2,2,2,3]; // Hidden semantic families, not exposed to predictor.
const examples=Number(process.env.NLS_TRANSFER_EXAMPLES||1000);
if(!Number.isInteger(examples)||examples<100||examples>10000)throw Error('bounded examples required');
const hash=(a,b,c)=>{let x=(Math.imul(a+1,2654435761)^Math.imul(b+17,1597334677)^Math.imul(c+23,2246822519))>>>0;x^=x>>>16;x=Math.imul(x,2246822519)>>>0;x^=x>>>13;return x>>>0};
const observation=(d,i)=>{const x=hash(d,i,17)%1000;const family=rules[d];const y=family===0?x>=500:family===1?x>=650:family===2?x>=350:x>=800;return{x,y:Number(y)}};
const train=(xs)=>{const positives=xs.filter(x=>x.y).map(x=>x.x);const negatives=xs.filter(x=>!x.y).map(x=>x.x);if(!positives.length||!negatives.length)return null;return(Math.min(...positives)+Math.max(...negatives))/2};
const predict=(threshold,x)=>Number(x>=threshold);
const start=performance.now();const results=[];
for(let d=0;d<domains.length;d++){
 const own=Array.from({length:Math.floor(examples/10)},(_,i)=>observation(d,i));
 const unseen=Array.from({length:examples},(_,i)=>observation(d,i+100000));
 const base=train(own.slice(0,10));
 // Transfer is allowed only when peer examples agree with local calibration samples.
 const candidates=domains.map((_,peer)=>{if(peer===d)return null;const peerTrain=Array.from({length:100},(_,i)=>observation(peer,i));const threshold=train(peerTrain);if(threshold===null)return null;const agreement=own.slice(0,10).filter(x=>predict(threshold,x.x)===x.y).length/10;return{peer,threshold,agreement}}).filter(Boolean).sort((a,b)=>b.agreement-a.agreement||a.peer-b.peer);
 const chosen=candidates.find(c=>c.agreement===1);
 const transfer=chosen?chosen.threshold:base;
 const accuracy=(t)=>unseen.reduce((sum,x)=>sum+Number(predict(t,x.x)===x.y),0)/unseen.length;
 const baselineCorrect=unseen.filter(x=>predict(base,x.x)===x.y).length;const transferCorrect=unseen.filter(x=>predict(transfer,x.x)===x.y).length;const gate=evaluateSemanticTransfer({baselineCorrect,transferCorrect,holdoutCount:unseen.length,independent:false,holdoutUntouched:true,provenanceRef:'synthetic:self-evaluation',authorityDrift:0});
 results.push({domain:domains[d],baselineAccuracy:accuracy(base),transferAccuracy:accuracy(transfer),transferPeer:chosen?domains[chosen.peer]:null,calibrationCount:10,holdoutCount:unseen.length,gate:gate.decision,gateReason:gate.reason});
}
const avg=k=>results.reduce((s,x)=>s+x[k],0)/results.length;
const report={kind:'synthetic_blind_holdout_transfer',scientificValidity:'NOT_ESTABLISHED',domains:domains.length,holdoutTotal:domains.length*examples,baselineMeanAccuracy:avg('baselineAccuracy'),transferMeanAccuracy:avg('transferAccuracy'),meanDelta:avg('transferAccuracy')-avg('baselineAccuracy'),positiveDomains:results.filter(x=>x.transferAccuracy>x.baselineAccuracy).length,negativeDomains:results.filter(x=>x.transferAccuracy<x.baselineAccuracy).length,elapsedMs:Math.round(performance.now()-start),results};
writeFileSync('/tmp/nyxa-nls-transfer-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
