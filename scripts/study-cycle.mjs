/** Bounded, resumable study research worker. One module per invocation, no auto-graduation. */
import {readFile,writeFile,rename,mkdir,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {planStudyCycle,LAW_SCHOOL_S1} from '../dist/epistemic/studyAdapter.js';
import {researchBridge} from '../dist/epistemic/researchBridge.js';
const directory=process.env.NYXA_STUDY_STATE_DIR||'/tmp/nyxa-study-agent';
const autoAdvance=process.env.NYXA_STUDY_AUTO_ADVANCE==='true';
await mkdir(directory,{recursive:true,mode:0o700});
const file=directory+'/law-school.json';
const lock=await open(directory+'/law-school.lock','wx',0o600).catch(e=>{if(e.code==='EEXIST')throw new Error('study_cycle_already_running');throw e});
try {
 let state;try{state=JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;state={completed:[],failed:[],unresolved:[],history:[]}}
 if(!Array.isArray(state.completed)||!Array.isArray(state.failed)||!Array.isArray(state.unresolved)||!Array.isArray(state.history))throw Error('study_state_invalid');
 // Independent verifier is fail-closed: evidence retrieval is never a passing exam.
 if(state.unresolved.length){
  const latest=state.history.at(-1);
  const review={at:new Date().toISOString(),module:latest?.module,status:'HOLD',reason:'no_independently_adjudicated_holdout_exam',sourceCount:latest?.sourceRefs?.length||0};
  if(latest&&!latest.verifier){latest.verifier=review;const tmp=file+'.review.'+process.pid;await writeFile(tmp,JSON.stringify(state,null,2),{mode:0o600});await rename(tmp,file)}
  console.log(JSON.stringify({status:'AWAITING_INDEPENDENT_EXAM',pending:state.unresolved,verifier:review}));
 }

 let plan;try{plan=state.unresolved.length?null:planStudyCycle(LAW_SCHOOL_S1,state)}catch(e){if(e.message!=='study_curriculum_exhausted')throw e;console.log(JSON.stringify({status:'AWAITING_NEW_STUDY_PACKAGE',completed:state.completed,history:state.history.length,autoAdvanceEnabled:autoAdvance}));process.exitCode=0;plan=null}
 if(plan){
  const result=await researchBridge({claim_id:plan.module.id,statement:plan.module.objectives.join('; '),evidence_strength:0,provenance_quality:0,impact_score:0.9},plan.module.sourceUrls);
  const entry={id:randomUUID(),module:plan.module.id,at:new Date().toISOString(),sourceRefs:result.outcome.evidence_graph.provenance_refs,missing:result.outcome.evidence_graph.missing_observables,stoppingReason:result.outcome.stopping_reason,authority:'NONE',review:'PENDING_INDEPENDENT_EXAM'};
  state.history.push(entry);if(!state.unresolved.includes(plan.module.id))state.unresolved.push(plan.module.id);
  // Do not mark completed: retrieval is not examination or independent verification.
  const temp=file+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600});await rename(temp,file);
  console.log(JSON.stringify({status:'AWAITING_INDEPENDENT_EXAM',module:plan.module.id,sourceRefs:entry.sourceRefs.length,review:entry.review,history:state.history.length}));
 }
}finally{await lock.close();await import('node:fs/promises').then(fs=>fs.unlink(directory+'/law-school.lock'))}
