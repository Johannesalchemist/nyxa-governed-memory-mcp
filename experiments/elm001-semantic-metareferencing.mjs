// NSMF v0: typed cross-domain meta-relations, explicit evidence and foreign-domain gate.
// Synthetic structural analogy is a hypothesis, never proof of transferable law.
import {writeFileSync} from 'node:fs';
const schema='NYXA.NSMF.MetaReference.v0';
const observations=[
 {id:'law-1',domain:'LAW',subject:'administrative_action',relation:'REQUIRES_BEFORE',object:'justification_evidence',failure:'MISSING_BOUNDARY',evidence:'synthetic:law-1'},
 {id:'software-1',domain:'SOFTWARE',subject:'privileged_action',relation:'REQUIRES_BEFORE',object:'authorization_evidence',failure:'MISSING_BOUNDARY',evidence:'synthetic:software-1'},
 {id:'production-1',domain:'PRODUCTION',subject:'production_release',relation:'REQUIRES_BEFORE',object:'quality_evidence',failure:'MISSING_BOUNDARY',evidence:'synthetic:production-1'},
 {id:'biology-1',domain:'BIOLOGY',subject:'cellular_response',relation:'REGULATED_BY',object:'feedback_pathway',failure:'MISSING_BOUNDARY',evidence:'synthetic:biology-1'}
];
const normalize=x=>({...x,schema,epistemicStatus:'HYPOTHESIS',authority:'NONE',sourceType:'SYNTHETIC'});
const records=observations.map(normalize);
const grouped=Map.groupBy?Map.groupBy(records,x=>x.relation):new Map([...new Set(records.map(x=>x.relation))].map(r=>[r,records.filter(x=>x.relation===r)]));
const candidates=[...grouped].map(([relation,items])=>({relation,domains:[...new Set(items.map(x=>x.domain))],observations:items.map(x=>x.id),candidateInvariant:items.length>=3&&new Set(items.map(x=>x.domain)).size>=3,transferVerified:false,counterexampleRequired:true}));
const crossDomain=records.filter(x=>x.relation==='REQUIRES_BEFORE');
const challenge={candidate:'REQUIRES_BEFORE',sourceDomains:['LAW','SOFTWARE'],challengeDomains:['PRODUCTION'],foreignDomain:true,independentVerification:false,ablationPassed:false,decision:'HOLD'};
const negativeControl=records.find(x=>x.domain==='BIOLOGY').relation!=='REQUIRES_BEFORE';
const out={schema,kind:'SYNTHETIC_SEMANTIC_META_REFERENCE_PROBE',dimensions:['domain','relation','subject','object','failure','evidence','epistemicStatus','authority'],records,candidates,challenge,negativeControlPassed:negativeControl,authorityEffect:'NONE',promotionAllowed:false};
writeFileSync('/tmp/nyxa-nsmf-v0.json',JSON.stringify(out,null,2));console.log(JSON.stringify({records:records.length,domains:new Set(records.map(x=>x.domain)).size,candidates:candidates.length,structuralCandidate:candidates.filter(x=>x.candidateInvariant).map(x=>x.relation),negativeControlPassed:negativeControl,challengeDecision:challenge.decision,promotionAllowed:false},null,2));if(!negativeControl||challenge.decision!=='HOLD')process.exitCode=1;
