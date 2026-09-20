import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rename, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CandidateStore } from '../dist/memory/candidateStore.js';

async function server(options={}) {
 const dataDir=options.dataDir ?? await mkdtemp(join(tmpdir(),'nyxa-pending-data-'));
 const home=await mkdtemp(join(tmpdir(),'nyxa-pending-home-'));
 const transport=new StdioClientTransport({command:'/usr/bin/node',args:['dist/index.js'],cwd:resolve('.'),env:{PATH:process.env.PATH,HOME:home,NYXA_DATA_DIR:dataDir,NYXA_AGENT_MODE:options.mode??'draft',...(options.profile?{NYXA_MCP_TOOL_PROFILE:options.profile}:{})},stderr:'pipe'});
 const client=new Client({name:'pending-contract-test',version:'1.0.0'});
 await client.connect(transport);
 return {client,dataDir,close:()=>client.close()};
}
const payload={content:'Isolated pending candidate',candidate_type:'observation',source:'tool',scope:'project',purpose:'bounded contract test',confidence:0.8,importance:0.3};
function proposal(overrides={}) {return {actor:'pending-test',action:'nyxa_memory_store_candidate',target:'memory:/candidate',scope:'isolated pending append',claims:[{tag:'FACT',statement:'isolated observation',source:'pending-candidate-e2e.test.mjs'}],uncertainty:0,requestedCapabilityClass:'I1',estimatedIrreversibility:'I1',provenance:{taskId:'pending-contract',runId:crypto.randomUUID(),requestingIdentity:'tester'},payload:{...payload},...overrides};}
const parse=result=>JSON.parse(result.content[0].text);
const call=(s,p)=>s.client.callTool({name:'nyxa_propose_action',arguments:{proposal:p}}).then(parse);
async function lines(s,file='memory/candidates.jsonl'){return (await readFile(join(s.dataDir,file),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}

test('real governed profile: ALLOW persists one pending candidate, audits radius, rejects replay across restart',async t=>{
 const s=await server({profile:'chatgpt_governed_execute'});t.after(()=>s.close());
 const p=proposal();const first=await call(s,p);
 assert.equal(first.policy_decision,'ALLOW');assert.equal(first.result.status,'pending');
 assert.equal(first.result.effect_contract,'pending_project_candidate_append_v1');
 assert.equal((await lines(s)).length,1);
 const recall=parse(await s.client.callTool({name:'nyxa_memory_recall_candidates',arguments:{status:'pending',candidate_type:'observation',limit:10}}));
 assert.equal(recall.candidates.length,1);
 assert.equal(recall.candidates[0].id,first.result.id);
 assert.equal(recall.candidates[0].content,payload.content);
 const events=await lines(s,'audit.log.jsonl');const event=events.find(e=>e.tool==='nyxa_propose_action'&&e.result==='allowed');
 assert.equal(event.details.effect_resolution.radius,1);assert.equal(event.epistemic_hold,false);
 assert.equal((await call(s,p)).policy_decision,'DENY');assert.equal((await lines(s)).length,1);
 await s.close();
 const restarted=await server({dataDir:s.dataDir,profile:'chatgpt_governed_execute'});t.after(()=>restarted.close());
 const replay=await call(restarted,p);assert.equal(replay.policy_decision,'DENY');assert.equal(replay.domain,'REPLAY');
 assert.equal((await lines(restarted)).length,1);
});

test('weak evidence holds without a write; corrected evidence can retry',async t=>{
 const s=await server();t.after(()=>s.close());
 const p=proposal({claims:[{tag:'HYPOTHESIS',statement:'unverified',source:'unknown'}]});
 const held=await call(s,p);assert.equal(held.policy_decision,'HELD');assert.equal((await lines(s)).length,0);
 const fixed=await call(s,{...p,claims:proposal().claims});assert.equal(fixed.policy_decision,'ALLOW');assert.equal((await lines(s)).length,1);
});

test('observe_only and wrong host stop technically possible pending append',async t=>{
 const s=await server({mode:'observe_only'});t.after(()=>s.close());
 const r=await call(s,proposal());assert.equal(r.policy_decision,'DENY');assert.equal(r.domain,'C2');assert.equal((await lines(s)).length,0);
 const d=await server();t.after(()=>d.close());
 const wrong=await call(d,proposal({expected_target:'not-this-server'}));assert.equal(wrong.domain,'C0');assert.equal(wrong.policy_decision,'DENY');assert.equal((await lines(d)).length,0);
});

test('wrong target, scope, oversized or spoofed payload and dream remain blocked',async t=>{
 const s=await server();t.after(()=>s.close());
 for(const override of [{target:'https://example.invalid/write'},{target:'memory:/elsewhere'},{payload:{...payload,scope:'organization'}},{payload:{...payload,content:'x'.repeat(4001)}},{payload:{...payload,status:'promoted',effectRadius:0}},{action:'nyxa_dream_trigger'}]){
  const r=await call(s,proposal(override));assert.notEqual(r.policy_decision,'ALLOW');
 }
 assert.equal((await lines(s)).length,0);
});

test('direct invocation cannot bypass proposal governance',async t=>{
 const s=await server({profile:'chatgpt_governed_execute'});t.after(()=>s.close());
 await assert.rejects(()=>s.client.callTool({name:'nyxa_memory_store_candidate',arguments:payload}),/Unknown tool/i);
 assert.equal((await lines(s)).length,0);
});

test('valid pending append followed by corrupted chain fails closed without another effect',async t=>{
 const s=await server();t.after(()=>s.close());assert.equal((await call(s,proposal())).policy_decision,'ALLOW');
 const path=join(s.dataDir,'memory/candidates.jsonl');const good=await readFile(path,'utf8');const bad=good.replace('Isolated pending candidate','Tampered pending candidate');await writeFile(path,bad);
 const r=await call(s,proposal());assert.equal(r.policy_decision,'ESCALATE');assert.equal(r.reason,'effect_radius_unknown_requires_human_review');assert.equal(await readFile(path,'utf8'),bad);
});

test('symlink and hardlink stores cannot obtain trusted radius or write',async t=>{
 const s=await server();t.after(()=>s.close());const path=join(s.dataDir,'memory/candidates.jsonl');const saved=path+'.original';await rename(path,saved);await symlink(saved,path);
 const r=await call(s,proposal());assert.equal(r.policy_decision,'ESCALATE');assert.equal(await readFile(saved,'utf8'),'');
 const h=await server();t.after(()=>h.close());const hp=join(h.dataDir,'memory/candidates.jsonl');await link(hp,hp+'.alias');assert.equal((await call(h,proposal())).policy_decision,'ESCALATE');assert.equal(await readFile(hp,'utf8'),'');
});

test('post-preflight corruption is rechecked at actual store write; queue recovers',async()=>{
 const data=await mkdtemp(join(tmpdir(),'nyxa-pending-race-'));const store=new CandidateStore(data);await store.init();
 assert.equal(await store.pendingAppendRadius('memory:/candidate',payload),1);
 const path=join(data,'memory/candidates.jsonl');await writeFile(path,'broken\n');
 const meta={writtenBy:'test',taskId:'test',runId:'test'};const allow={outcome:'ALLOW',domain:null,reason:'module fixture'};
 await assert.rejects(()=>store.writePendingProjectCandidate('memory:/candidate',payload,meta,allow));
 assert.equal(await readFile(path,'utf8'),'broken\n');
 await writeFile(path,'');await assert.rejects(()=>store.writePendingProjectCandidate('memory:/candidate',payload,meta,{outcome:'DENY',domain:'C2',reason:'denied'}));
 await store.writePendingProjectCandidate('memory:/candidate',payload,meta,allow);
 assert.equal((await store.recallCandidates({limit:10})).length,1);
});

test('execution rate limit remains effective for bounded writes',async t=>{
 const s=await server();t.after(()=>s.close());
 for(let i=0;i<10;i++)assert.equal((await call(s,proposal())).policy_decision,'ALLOW');
 const r=await call(s,proposal());assert.equal(r.policy_decision,'DENY');assert.equal(r.domain,'EXECUTION_GATE');assert.equal((await lines(s)).length,10);
});

test('governed recall honors filters and rejects invalid arguments without candidate mutation',async t=>{
 const s=await server({profile:'chatgpt_governed_execute'});t.after(()=>s.close());
 const listed=await s.client.listTools();const tool=listed.tools.find(x=>x.name==='nyxa_memory_recall_candidates');
 assert.ok(tool);assert.equal(tool.annotations.readOnlyHint,true);
 assert.equal((await call(s,proposal())).policy_decision,'ALLOW');
 const path=join(s.dataDir,'memory/candidates.jsonl');const before=await readFile(path,'utf8');
 for(const args of [{status:'promoted'},{candidate_type:'risk'}]){
  const r=parse(await s.client.callTool({name:tool.name,arguments:args}));assert.equal(r.candidates.length,0);
 }
 for(const args of [{limit:201},{limit:0},{path:'/etc/passwd'},{status:'pending',mode:'draft'}]){
  let r;
  try { r=await s.client.callTool({name:tool.name,arguments:args}); }
  catch (error) { assert.match(error.message,/arguments_invalid/); continue; }
  assert.equal(r.isError,true);
  assert.match(JSON.stringify(parse(r)),/arguments_invalid/);
 }
 assert.equal(await readFile(path,'utf8'),before);
});

test('readonly and unknown profiles do not inherit governed recall access',async t=>{
 for(const profile of ['chatgpt_readonly','unrecognized-profile']){
  const s=await server({profile});t.after(()=>s.close());
  assert.ok(!(await s.client.listTools()).tools.some(x=>x.name==='nyxa_memory_recall_candidates'));
  await assert.rejects(()=>s.client.callTool({name:'nyxa_memory_recall_candidates',arguments:{}}),/Unknown tool/i);
 }
});
