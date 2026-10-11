import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {proposeJevSemanticMaxims} from '../dist/semantic/jevExperienceAdapter.js';
import {semanticObservationsFromJev} from '../dist/semantic/jevExperienceAdapter.js';
import {deriveSemanticMaxims} from '../dist/semantic/linguaSemantica.js';
const domains=['SYSTEM_ARCHITECTURE','SIMULATION_DESIGN','CHIP_ARCHITECTURE','BUILT_ENVIRONMENT','ENERGY_SYSTEMS','ROBOTICS','CCAM','MATERIALS','BIOENGINEERING','BUSINESS_PRODUCTION'];
const perDomain=Number(process.env.NLS_CASES_PER_DOMAIN||300);if(!Number.isInteger(perDomain)||perDomain<1||perDomain>3000)throw Error('invalid bounded cases');
const make=(domain,i)=>({runId:`${domain}-${i}`,domain,arm:i%2?'JEV_ONLY':'JEV_DYNAMIC',scenarioRef:`unseen-${Math.floor(i/3)}`,seed:i,hypotheses:2,novelHypotheses:1,causalDepth:1,crossDomainLinks:i%3,experimentDesigns:1,disconfirmingTests:1,uncertaintiesExposed:1,redTeamFindings:0,simulationCandidates:1,evidenceConfirmed:i%17===0?0:2,evidenceRejected:i%23===0?1:0,objectiveGain:i%5===0?0:1,latencyMs:12,computeCost:1,authorityDrift:i%101===0?1:0,provenanceCoverage:i%29===0?.7:1});
const start=performance.now();const result=await Promise.all(domains.map(async domain=>{await new Promise(r=>setImmediate(r));const runs=Array.from({length:perDomain},(_,i)=>make(domain,i));const observations=semanticObservationsFromJev(runs);const maxims=proposeJevSemanticMaxims(runs);const valid=observations.length;const excluded=runs.length-valid;const held=maxims.filter(x=>x.status==='HYPOTHESIS').length;return{domain,runs:runs.length,observations:valid,excluded,maxims:maxims.length,held,unauthorized:maxims.filter(x=>x.authorityEffect!=='NONE').length};}));
const total=result.reduce((a,x)=>({runs:a.runs+x.runs,observations:a.observations+x.observations,excluded:a.excluded+x.excluded,maxims:a.maxims+x.maxims,held:a.held+x.held,unauthorized:a.unauthorized+x.unauthorized}),{runs:0,observations:0,excluded:0,maxims:0,held:0,unauthorized:0});
// Deliberately novel holdout: cross-domain contradictory definitions must not be silently collapsed.
const holdout=deriveSemanticMaxims([{domain:'CROSS_DOMAIN',term:'evidence',meaning:'instrument reading',context:'physics',sourceRef:'holdout:1',independent:true},{domain:'CROSS_DOMAIN',term:'evidence',meaning:'clinical endpoint',context:'medicine',sourceRef:'holdout:2',independent:true}]);
const report={kind:'synthetic_bounded_pipeline_load',perDomain,parallelDomains:domains.length,elapsedMs:Math.round(performance.now()-start),total,domains:result,holdoutContradictionPreserved:holdout[0]?.status==='HYPOTHESIS'&&holdout[0]?.counterexampleRefs.length===1,authorityEffect:'NONE',scientificValidity:'NOT_ESTABLISHED'};
if(total.runs!==perDomain*domains.length||total.unauthorized!==0||!report.holdoutContradictionPreserved)throw Error('load acceptance failed');
writeFileSync('/tmp/nyxa-nls-load-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
