import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const source='https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1689';

async function open(mode){
 const dataDir=await mkdtemp(join(tmpdir(),'nyxa-research-bridge-'));
 const home=await mkdtemp(join(tmpdir(),'nyxa-research-home-'));
 const client=new Client({name:'research-bridge-test',version:'1'});
 await client.connect(new StdioClientTransport({command:'/usr/bin/node',args:['dist/index.js'],cwd:resolve('.'),env:{PATH:process.env.PATH,HOME:home,NYXA_DATA_DIR:dataDir,NYXA_AGENT_MODE:mode},stderr:'pipe'}));
 return client;
}

const packet={claim_id:'ai-act',statement:'Is AI Act applicable?',evidence_strength:.1,provenance_quality:.1,impact_score:.9};
const parse=r=>JSON.parse(r.content[0].text);

test('LIVE MCP discovery exposes bounded identity-checked research and retains HOLD',async t=>{
 const client=await open('draft');t.after(()=>client.close());
 const list=await client.listTools();
 assert.ok(list.tools.some(x=>x.name==='nyxa_research_depth_drill'));
 const r=parse(await client.callTool({name:'nyxa_research_depth_drill',arguments:{packet,sources:[source]}}));
 assert.equal(r.epistemic_authority,'NONE',JSON.stringify(r));
 assert.equal(r.promotion_allowed,false);
 assert.equal(r.outcome.stopping_reason,'human_input_required',JSON.stringify(r));
 const refs=r.outcome.evidence_graph.provenance_refs;
 const missing=r.outcome.evidence_graph.missing_observables;
 const verified=refs.some(x=>x.startsWith(source+'#retrieved_bytes=')&&x.includes('identity=eurlex-celex%3A32024R1689'));
 const held=missing.some(x=>x.startsWith(source+':')&&/(document_identity_mismatch|fetch_failed_or_bounded|unusable_response|empty_body)$/.test(x));
 assert.ok(verified||held,JSON.stringify(r));
 assert.ok(refs.every(x=>x.includes('&identity=')),JSON.stringify(r));
 assert.notEqual(r.outcome.final.classification,'KNOWN');
});

test('observe_only refuses research execution',async t=>{
 const client=await open('observe_only');t.after(()=>client.close());
 const r=parse(await client.callTool({name:'nyxa_research_depth_drill',arguments:{packet,sources:[source]}}));
 assert.equal(r.policy_decision,'DENY');
});
