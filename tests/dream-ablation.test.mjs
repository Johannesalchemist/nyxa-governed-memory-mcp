import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {deriveDreamCandidate} from '../dist/memory/dreamTrigger.js';
test('ablation selects only the configured source without calling omitted source',async()=>{
 for(const mode of ['full','audit_only','self_model_only']){
  let selfReads=0,auditReads=0;
  const s={recentAutobiographical:async()=>{selfReads++;return[{eventType:'decision',occurredAt:'2026-10-11T00:00:00Z'}];}};
  const a={recent:async()=>{auditReads++;return[{policy_decision:'DENY'}];}};
  const c=await deriveDreamCandidate(s,a,mode);
  assert.equal(selfReads,mode==='audit_only'?0:1);assert.equal(auditReads,mode==='self_model_only'?0:1);
  assert.equal(c.content.includes('decision=1'),mode!=='audit_only');
  assert.equal(c.content.includes('DENY=1'),mode!=='self_model_only');
  assert.match(c.content,new RegExp('Mode: '+mode));assert.match(c.purpose,new RegExp(mode));
  assert.equal(c.scope,'project');assert.equal(c.candidate_type,'dream_summary');
 }
});
test('off and invalid modes never read internal inputs or produce candidates',async()=>{
 const noRead={recentAutobiographical:async()=>{throw Error('unexpected read');}};
 const noAudit={recent:async()=>{throw Error('unexpected read');}};
 for(const mode of ['off','invalid','',true])await assert.rejects(()=>deriveDreamCandidate(noRead,noAudit,mode),/dream_mode_disabled_or_invalid/);
});
const parse=r=>JSON.parse(r.content[0].text);
async function start(mode,enabled=true){
 const dataDir=await mkdtemp(join(tmpdir(),'nyxa-ablation-'));
 const transport=new StdioClientTransport({command:'/usr/bin/node',args:['dist/index.js'],cwd:resolve('.'),env:{PATH:process.env.PATH,HOME:dataDir,NYXA_DATA_DIR:dataDir,NYXA_AGENT_MODE:'draft',NYXA_MCP_TOOL_PROFILE:'chatgpt_governed_execute',NYXA_DREAMING_ENABLED:String(enabled),NYXA_DREAM_MODE:mode},stderr:'pipe'});
 const client=new Client({name:'dream-ablation-proof',version:'1.0.0'});await client.connect(transport);return{client,dataDir};
}
function proposal(){return{actor:'ablation-test',action:'nyxa_dream_trigger',target:'memory:/dream',scope:'bounded ablation proof',claims:[{tag:'FACT',statement:'Derive from configured internal input subset only.',source:'tests/dream-ablation.test.mjs'}],uncertainty:0,requestedCapabilityClass:'I1',estimatedIrreversibility:'I1',expected_target:'nixa-01',provenance:{taskId:'dream-ablation',runId:randomUUID(),requestingIdentity:'integration-test'}};}
for(const mode of ['full','audit_only','self_model_only'])test('real governed MCP mode '+mode,async t=>{
 const s=await start(mode);t.after(()=>s.client.close());
 const res=parse(await s.client.callTool({name:'nyxa_propose_action',arguments:{proposal:proposal()}}));assert.equal(res.policy_decision,'ALLOW');
 const records=(await readFile(join(s.dataDir,'memory/candidates.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(records.length,1);assert.equal(records[0].status,'pending');assert.match(records[0].content,new RegExp('Mode: '+mode));
 if(mode==='audit_only')assert.match(records[0].content,/last 0 autobiographical event/);
 if(mode==='self_model_only')assert.match(records[0].content,/and 0 audit entries/);
 const recalled=parse(await s.client.callTool({name:'nyxa_memory_recall_candidates',arguments:{candidate_type:'dream_summary',status:'pending',limit:1}}));assert.equal(recalled.candidates[0].content,records[0].content);
});
for(const mode of ['off','unknown'])test('real MCP fails closed for '+mode,async t=>{
 const s=await start(mode);t.after(()=>s.client.close());
 const res=parse(await s.client.callTool({name:'nyxa_propose_action',arguments:{proposal:proposal()}}));assert.notEqual(res.policy_decision,'ALLOW');assert.equal(await readFile(join(s.dataDir,'memory/candidates.jsonl'),'utf8'),'');
});
test('master off overrides full ablation mode',async t=>{
 const s=await start('full',false);t.after(()=>s.client.close());const res=parse(await s.client.callTool({name:'nyxa_propose_action',arguments:{proposal:proposal()}}));assert.notEqual(res.policy_decision,'ALLOW');assert.equal(await readFile(join(s.dataDir,'memory/candidates.jsonl'),'utf8'),'');
});
