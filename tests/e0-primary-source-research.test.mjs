import test from 'node:test';
import assert from 'node:assert/strict';
import { PrimarySourceResearchProvider } from '../dist/epistemic/primarySourceResearch.js';
import { runDepthDrill } from '../dist/epistemic/depthDrill.js';

const input={claim_id:'grant',statement:'Is grant eligible?',evidence_strength:0.1,provenance_quality:0.1,impact_score:0.9,evidence_missing:true};
const eurlex='https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1689';
const request={claim:input,signal:undefined};

function response(url,body,{status=200,type='text/plain'}={}){
 const value=new Response(body,{status,headers:{'content-type':type}});
 Object.defineProperty(value,'url',{value:url});
 return value;
}

test('allowlist blocks untrusted and non-HTTPS sources',()=>{
 for(const url of ['http://ec.europa.eu/x','https://evil.example/x','https://ec.europa.eu:444/x','https://user@ec.europa.eu/x']) assert.throws(()=>new PrimarySourceResearchProvider([url]));
});

test('bounded retrieval preserves uncertainty and exact request URL provenance',async()=>{
 let calls=0;
 const source='https://ec.europa.eu/test';
 const provider=new PrimarySourceResearchProvider([source],async (_url,opts)=>{
  calls++;assert.equal(opts.redirect,'error');return response(source,'source data');
 });
 const result=await runDepthDrill(input,provider,{max_iterations:2,max_research_agents:1,max_tool_calls:1,max_wall_time_ms:2000,no_gain_stop_after:1});
 assert.equal(calls,1);assert.equal(result.tool_calls_used,1);
 assert.equal(result.stopping_reason,'human_input_required');
 assert.notEqual(result.final.classification,'KNOWN');
 assert.match(result.evidence_graph.provenance_refs[0],/identity=request-url/);
});

test('response URL substitution fails closed',async()=>{
 const source='https://ec.europa.eu/test';
 const provider=new PrimarySourceResearchProvider([source],async()=>response('https://ec.europa.eu/other','source data'));
 const finding=await provider.research(request);
 assert.deepEqual(finding.provenance_refs,[]);
 assert.deepEqual(finding.missing_observables,[source+':document_identity_mismatch']);
});

test('EUR-Lex CELEX identity requires matching body token and title citation',async()=>{
 const body='<html><head><title>Regulation - EU - 2024/1689 - EN - EUR-Lex</title></head><body>CELEX 32024R1689</body></html>';
 const provider=new PrimarySourceResearchProvider([eurlex],async()=>response(eurlex,body,{type:'text/html'}));
 const finding=await provider.research(request);
 assert.deepEqual(finding.missing_observables,[]);
 assert.equal(finding.provenance_refs.length,1);
 assert.match(finding.provenance_refs[0],/identity=eurlex-celex%3A32024R1689/);
});

test('EUR-Lex wrong document body fails closed despite HTTP 200',async()=>{
 const body='<html><head><title>Regulation - EU - 2024/9999 - EN - EUR-Lex</title></head><body>CELEX 32024R9999</body></html>';
 const provider=new PrimarySourceResearchProvider([eurlex],async()=>response(eurlex,body,{type:'text/html'}));
 const finding=await provider.research(request);
 assert.deepEqual(finding.provenance_refs,[]);
 assert.deepEqual(finding.missing_observables,[eurlex+':document_identity_mismatch']);
});

test('oversized source remains bounded and cannot gain provenance',async()=>{
 const body='<title>Regulation - EU - 2024/1689 - EN - EUR-Lex</title>32024R1689'+('x'.repeat(128*1024));
 const provider=new PrimarySourceResearchProvider([eurlex],async()=>response(eurlex,body,{type:'text/html'}));
 const finding=await provider.research(request);
 assert.deepEqual(finding.provenance_refs,[]);
 assert.deepEqual(finding.missing_observables,[eurlex+':fetch_failed_or_bounded']);
});
