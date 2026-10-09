import test from 'node:test';
import assert from 'node:assert/strict';
import { PrimarySourceResearchProvider } from '../dist/epistemic/primarySourceResearch.js';
import { runDepthDrill } from '../dist/epistemic/depthDrill.js';
const input={claim_id:'grant',statement:'Is grant eligible?',evidence_strength:0.1,provenance_quality:0.1,impact_score:0.9,evidence_missing:true};
test('allowlist blocks untrusted and non-HTTPS sources',()=>{
 for(const url of ['http://ec.europa.eu/x','https://evil.example/x','https://ec.europa.eu:444/x','https://user@ec.europa.eu/x']) assert.throws(()=>new PrimarySourceResearchProvider([url]));
});
test('bounded retrieval preserves uncertainty and source provenance',async()=>{
 let calls=0;
 const provider=new PrimarySourceResearchProvider(['https://ec.europa.eu/test'],async (_url,opts)=>{
  calls++;assert.equal(opts.redirect,'error');return new Response('source data',{status:200,headers:{'content-type':'text/plain'}});
 });
 const result=await runDepthDrill(input,provider,{max_iterations:2,max_research_agents:1,max_tool_calls:1,max_wall_time_ms:2000,no_gain_stop_after:1});
 assert.equal(calls,1);assert.equal(result.tool_calls_used,1);
 assert.equal(result.stopping_reason,'human_input_required');
 assert.notEqual(result.final.classification,'KNOWN');
 assert.match(result.evidence_graph.provenance_refs[0],/ec.europa.eu/);
});
