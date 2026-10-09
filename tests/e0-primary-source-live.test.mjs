import test from 'node:test';
import assert from 'node:assert/strict';
import {PrimarySourceResearchProvider} from '../dist/epistemic/primarySourceResearch.js';
import {runDepthDrill} from '../dist/epistemic/depthDrill.js';

const source='https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1689';

test('LIVE: official EUR-Lex response is identity-verified or retained as missing, never self-verifies',async()=>{
 const provider=new PrimarySourceResearchProvider([source]);
 const input={claim_id:'ai-act',statement:'Does EU AI Act govern the claim?',evidence_strength:.1,provenance_quality:.1,impact_score:.9};
 const result=await runDepthDrill(input,provider,{max_iterations:1,max_research_agents:1,max_tool_calls:1,max_wall_time_ms:15000,no_gain_stop_after:1});
 assert.equal(result.tool_calls_used,1);
 assert.equal(result.stopping_reason,'human_input_required',JSON.stringify(result));
 const refs=result.evidence_graph.provenance_refs;
 const missing=result.evidence_graph.missing_observables;
 const verified=refs.some(x=>x.startsWith(source+'#retrieved_bytes=')&&x.includes('identity=eurlex-celex%3A32024R1689'));
 const held=missing.some(x=>x.startsWith(source+':')&&/(document_identity_mismatch|fetch_failed_or_bounded|unusable_response|empty_body)$/.test(x));
 assert.ok(verified||held,JSON.stringify(result));
 assert.ok(refs.every(x=>x.includes('&identity=')),JSON.stringify(result));
 assert.notEqual(result.final.classification,'KNOWN');
});
