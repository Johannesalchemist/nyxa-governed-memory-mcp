import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rename, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function server(options={}) {
 const dataDir=options.dataDir ?? await mkdtemp(join(tmpdir(),'nyxa-dream-data-'));
 const home=await mkdtemp(join(tmpdir(),'nyxa-dream-home-'));
 const transport=new StdioClientTransport({command:'/usr/bin/node',args:['dist/index.js'],cwd:resolve('.'),env:{PATH:process.env.PATH,HOME:home,NYXA_DATA_DIR:dataDir,NYXA_AGENT_MODE:options.mode??'draft',NYXA_MCP_TOOL_PROFILE:'chatgpt_governed_execute',NYXA_DREAMING_ENABLED:options.enabled===false?'false':'true'},stderr:'pipe'});
 const client=new Client({name:'bounded-dream-integration',version:'1.0.0'});
 await client.connect(transport);
 return {client,dataDir,close:()=>client.close()};
}
function proposal(overrides={}) {return {actor:'dream-pilot',action:'nyxa_dream_trigger',target:'memory:/dream',scope:'one pending project summary',claims:[{tag:'CLAIM',statement:'Derive one bounded summary of internal recorded experience; no promotion or external action.',source:'tests/dream-cycle-e2e.test.mjs'}],uncertainty:0,requestedCapabilityClass:'I1',estimatedIrreversibility:'I1',provenance:{taskId:'bounded-dream-pilot',runId:randomUUID(),requestingIdentity:'integration-test'},...overrides};}
const parse=r=>JSON.parse(r.content[0].text);
const call=(s,p)=>s.client.callTool({name:'nyxa_propose_action',arguments:{proposal:p}}).then(parse);
async function rows(s,file='memory/candidates.jsonl'){return (await readFile(join(s.dataDir,file),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}

test('real MCP dream cycle writes one pending summary, recalls it and rejects replay across restart',async t=>{
 const s=await server();t.after(()=>s.close());const p=proposal();
 const first=await call(s,p);assert.equal(first.policy_decision,'ALLOW');assert.equal(first.result.written,'dream_candidate');
 const records=await rows(s);assert.equal(records.length,1);const record=records[0];
 assert.equal(record.id,first.result.id);assert.equal(record.status,'pending');assert.equal(record.scope,'project');
 assert.equal(record.source,'dream');assert.equal(record.candidate_type,'dream_summary');assert.match(record.content,/Governance decisions:/);
 const recalled=parse(await s.client.callTool({name:'nyxa_memory_recall_candidates',arguments:{status:'pending',candidate_type:'dream_summary',limit:10}}));
 assert.equal(recalled.candidates[0].id,record.id);assert.equal(recalled.candidates[0].content,record.content);
 const events=await rows(s,'audit.log.jsonl');const event=events.find(e=>e.tool==='nyxa_propose_action'&&e.result==='allowed'&&e.details?.effect_resolution);
 assert.equal(event.details.effect_resolution.radius,1);assert.equal(event.epistemic_hold,false);
 assert.equal((await call(s,p)).policy_decision,'DENY');assert.equal((await rows(s)).length,1);
 await s.close();const restarted=await server({dataDir:s.dataDir});t.after(()=>restarted.close());
 const replay=await call(restarted,p);assert.equal(replay.domain,'REPLAY');assert.equal((await rows(restarted)).length,1);
});

test('disabled dreaming and observe_only cannot write',async t=>{
 for(const options of [{enabled:false},{mode:'observe_only'}]){
  const s=await server(options);t.after(()=>s.close());assert.notEqual((await call(s,proposal())).policy_decision,'ALLOW');assert.equal((await rows(s)).length,0);
 }
});

test('wrong host, changed target and injected summary/scope/status/radius fail without effects',async t=>{
 const s=await server();t.after(()=>s.close());
 for(const override of [{expected_target:'not-this-server'},{target:'memory:/candidate'},{target:'https://example.invalid/'},{payload:{content:'injected'}},{payload:{scope:'organization'}},{payload:{status:'promoted',effectRadius:1}}]){
  assert.notEqual((await call(s,proposal(override))).policy_decision,'ALLOW');assert.equal((await rows(s)).length,0);
 }
});

test('E0 holds weak evidence; correcting evidence allows same intent to retry',async t=>{
 const s=await server();t.after(()=>s.close());const p=proposal({claims:[{tag:'HYPOTHESIS',statement:'unverified',source:'unknown'}]});
 const held=await call(s,p);assert.equal(held.policy_decision,'HELD');assert.equal((await rows(s)).length,0);
 const allowed=await call(s,{...p,claims:proposal().claims});assert.equal(allowed.policy_decision,'ALLOW');assert.equal((await rows(s)).length,1);
});

test('corrupted candidate chain cannot get a trusted dream radius or a second write',async t=>{
 const s=await server();t.after(()=>s.close());assert.equal((await call(s,proposal())).policy_decision,'ALLOW');
 const p=join(s.dataDir,'memory/candidates.jsonl');const raw=await readFile(p,'utf8');const bad=raw.replace('Dream cycle summary','Tampered cycle summary');assert.notEqual(bad,raw);await writeFile(p,bad);
 const denied=await call(s,proposal());assert.equal(denied.policy_decision,'ESCALATE');assert.equal(await readFile(p,'utf8'),bad);
});

test('symlink and hardlink candidate stores cannot receive dream writes',async t=>{
 for(const kind of ['symlink','hardlink']){
  const s=await server();t.after(()=>s.close());const p=join(s.dataDir,'memory/candidates.jsonl');
  if(kind==='symlink'){await rename(p,p+'.saved');await symlink(p+'.saved',p);}else{await link(p,p+'.alias');}
  assert.notEqual((await call(s,proposal())).policy_decision,'ALLOW');assert.equal(await readFile(p,'utf8'),'');
 }
});

test('direct dream invocation cannot bypass the governed proposal path',async t=>{
 const s=await server();t.after(()=>s.close());
 await assert.rejects(()=>s.client.callTool({name:'nyxa_dream_trigger',arguments:{}}),/Unknown tool/i);
 assert.equal((await rows(s)).length,0);
});
