import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const compiled = process.env.NYXA_NEWSROOM_TEST_DIST ?? new URL('../dist', import.meta.url).pathname;
const { consultNewsroom, parseNewsroomInput } = await import(pathToFileURL(compiled + '/cognitive/newsroom.js').href);
const catalog = {data:[{id:'openai/test-model',architecture:{input_modalities:['text']}},{id:'anthropic/claude-test',architecture:{input_modalities:['text']}}]};
async function fixture(reply, run) {
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.OPENROUTER_API_KEY;
  let calls=0;
  process.env.OPENROUTER_API_KEY='fixture-only-not-a-credential';
  globalThis.fetch=async(url,options)=> {
    if(url.endsWith('/models'))return Response.json(catalog);
    calls++;
    return reply(JSON.parse(options.body));
  };
  try { await run(()=>calls); }
  finally { globalThis.fetch=originalFetch; if(originalKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=originalKey; }
}
const body=(model,extra={})=>({id:'fixture-request',model,provider:'fixture-provider',choices:[{message:{content:'Disagreement remains unresolved.'}}],...extra});
test('valid response retains input/output provenance without inventing synthesis',async()=>{
 await fixture(({model})=>Response.json(body(model)),async(calls)=>{
  const input=parseNewsroomInput({prompt:'Assess the book',participants:['openai'],input_refs:['book:chapter-1'],evidence_refs:['source:1']});
  const r=await consultNewsroom(input);const c=r.contributions[0];
  assert.equal(calls(),1);assert.deepEqual(r.successful_participants,['openai']);assert.equal(r.anti_phantom_pass,true);
  assert.equal(c.transport,'openrouter');assert.equal(c.actual_model,'openai/test-model');assert.equal(c.provider,'fixture-provider');assert.equal(c.modality,'text');
  assert.ok(c.task_id&&c.started_at&&c.completed_at);assert.equal(c.request_id,'fixture-request');
  assert.ok(c.input_refs.includes('book:chapter-1'));assert.deepEqual(c.evidence_refs,['source:1']);
  assert.equal(c.output_sha256,createHash('sha256').update(c.output).digest('hex'));assert.equal(c.output_ref,'sha256:'+c.output_sha256);
  assert.equal(c.uncertainty.status,'not_assessed');assert.equal(c.material_dissent.status,'not_assessed');
  assert.equal(r.synthesis_status,'not_performed');assert.equal(r.authority_effect,'NONE');
 });
});
test('missing optional provider retains verified model provenance',async()=>{
 await fixture(({model})=>Response.json(body(model,{provider:undefined})),async()=>{
  const r=await consultNewsroom(parseNewsroomInput({prompt:'Assess',participants:['openai']}));
  assert.deepEqual(r.successful_participants,['openai']);
  assert.equal(r.anti_phantom_pass,true);
  assert.equal(r.contributions[0].status,'ok');
  assert.equal(r.contributions[0].actual_model,'openai/test-model');
  assert.equal(r.contributions[0].provider,undefined);
  assert.equal(r.contributions[0].request_id,'fixture-request');
 });
});

for(const [name,extra] of [['missing model',{model:undefined}],['missing request id',{id:undefined}],['model substitution',{model:'anthropic/claude-test'}]]) {
 test(name+' cannot become a successful participant',async()=>{
  await fixture(({model})=>Response.json(body(model,extra)),async()=>{
   const r=await consultNewsroom(parseNewsroomInput({prompt:'Assess',participants:['openai']}));
   assert.deepEqual(r.successful_participants,[]);assert.equal(r.anti_phantom_pass,false);assert.equal(r.contributions[0].status,'failed');
  });
 });
}
test('HTTP failure stays visible beside successful participant',async()=>{
 await fixture(({model})=>model.startsWith('anthropic/')?new Response('',{status:402}):Response.json(body(model)),async(calls)=>{
  const r=await consultNewsroom(parseNewsroomInput({prompt:'Assess',participants:['openai','claude']}));
  assert.equal(calls(),2);assert.deepEqual(r.successful_participants,['openai']);assert.equal(r.contributions.length,2);
  assert.equal(r.contributions[1].error_code,'openrouter_http_402');
 });
});
test('invalid evidence references are rejected before requests',()=>{
 assert.throws(()=>parseNewsroomInput({prompt:'Assess',evidence_refs:[42]}),/evidence_refs_invalid/);
});
