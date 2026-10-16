/** One-at-a-time comprehension questions; generating a question never constitutes a pass. */
import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {consultNewsroom} from '../dist/cognitive/newsroom.js';
import {claudeExaminer} from '../dist/epistemic/claudeExaminer.js';
const directory=process.env.NYXA_STUDY_STATE_DIR||'/tmp/nyxa-study-agent';
await mkdir(directory,{recursive:true,mode:0o700});
const file=directory+'/law-school.json';
const lock=await open(directory+'/law-school.lock','wx',0o600);
try{
 const state=JSON.parse(await readFile(file,'utf8'));
 const cases=[
  {module:'law-method',question:'Eine Gemeinde verbietet eine friedliche politische Rede auf dem Marktplatz. Prüfe im Gutachtenstil mögliche Grundrechte, Schutzbereich, Eingriff, Rechtfertigung, fehlende Tatsachen und Gegenargumente.',rubric:['Normen und Schutzbereich','Subsumtion statt bloßer Behauptung','Verhältnismäßigkeit und Gegenargumente','Unsicherheiten und fehlende Tatsachen']},
  {module:'law-constitutional',question:'Eine Kommune untersagt pauschal alle öffentlichen Versammlungen. Untersuche Art. 8 GG, Schranken, Verhältnismäßigkeit und mögliche Gleichheitsfragen; benenne entscheidungserhebliche Tatsachen.',rubric:['Art. 8 GG korrekt differenzieren','Eingriff und Schranken','Verhältnismäßigkeit','Gegenposition und offene Tatsachen']}
 ];
 if(!Array.isArray(state.studied))throw Error('studied_state_missing');
 if(!Array.isArray(state.comprehension))state.comprehension=[];

 const pending=state.comprehension.find(x=>x.status==='AWAITING_ANSWER'||x.status==='AWAITING_REVIEW');
 let record=pending;
 if(!record){
  const next=cases.find(x=>state.studied.includes(x.module)&&!state.comprehension.some(y=>y.module===x.module&&y.status==='PASSED'));
  if(!next){console.log(JSON.stringify({status:'CURRICULUM_REVIEWED',studied:state.studied}));}
  else{
   record={id:randomUUID(),...next,status:'AWAITING_ANSWER',createdAt:new Date().toISOString(),pass:false,authority:'NONE'};
   state.comprehension.push(record);
  }
 }
 if(record){
  const entry=[...state.history].reverse().find(x=>x.module===record.module);
  if(!entry?.sourceRefs?.length)throw Error('source_references_missing');
  if(record.status==='AWAITING_ANSWER'){
   try{
    const response=await consultNewsroom({prompt:JSON.stringify({role:'Sophia, independent study candidate',question:record.question,rubric:record.rubric,instruction:'Give a reasoned German legal analysis; distinguish law, facts and uncertainty; do not claim an exam pass.'}),participants:['openai'],modality:'research',evidence_refs:entry.sourceRefs});
    const c=response.contributions?.find(x=>x.participant==='openai'&&x.status==='ok');
    if(!c?.output||!c?.actual_model)throw Error('candidate_provider_unavailable');
    record.answer=c.output;record.model=c.actual_model;
    record.answerSha256=createHash('sha256').update(c.output).digest('hex');
    record.status='AWAITING_REVIEW';
   }catch(e){record.lastError=String(e?.message||e).slice(0,200);}
  }
  if(record.status==='AWAITING_REVIEW'){
   try{
    const verdict=await claudeExaminer({moduleId:record.module,question:record.question,answer:record.answer,rubric:record.rubric,sourceRefs:entry.sourceRefs});
    record.verdict=verdict;record.pass=verdict.status==='PASS_CANDIDATE';
    record.status=record.pass?'PASSED':'NEEDS_RESTUDY';
   }catch(e){record.lastError=String(e?.message||e).slice(0,200);}
  }
  const tmp=file+'.comprehension.'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2),{mode:0o600});await rename(tmp,file);
  console.log(JSON.stringify({status:record.status,module:record.module,pass:record.pass,model:record.model||null,score:record.verdict?.score??null,error:record.lastError||null}));
 }

}finally{await lock.close();await unlink(directory+'/law-school.lock')}
