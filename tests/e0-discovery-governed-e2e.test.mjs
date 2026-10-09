import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ProposalSchema } from '../dist/governance/proposal.js';
import { findExistingDiscoveryCandidate } from '../dist/epistemic/discoveryCandidate.js';
import { assessEpistemicStateSafely } from '../dist/epistemic/integration.js';
import { TOOL_POLICIES } from '../dist/policy/toolPolicy.js';

const parse = r => JSON.parse(r.content[0].text);
const origin = (run, statement='Unverified business assumption') => ({
 actor:'discovery-e2e',action:'nyxa_memory_store_candidate',target:'memory:/candidate',scope:'project',
 claims:[{tag:'HYPOTHESIS',statement,source:'research:unverified'}],uncertainty:0.9,
 requestedCapabilityClass:'I1',estimatedIrreversibility:'I1',
 provenance:{taskId:'discovery-e2e',runId:run,requestingIdentity:'test'},
 payload:{content:'Unverified business assumption',candidate_type:'open_question',source:'system',scope:'project',purpose:'research',confidence:0.1,importance:0.9}
});

test('real MCP: E0 HOLD -> schema-valid governed proposal -> Gamma write -> recall -> recheck without promotion',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'nyxa-e0-discovery-e2e-'));
 const home=await mkdtemp(join(tmpdir(),'nyxa-e0-discovery-home-'));
 const transport=new StdioClientTransport({command:'/usr/bin/node',args:['dist/index.js'],cwd:resolve('.'),env:{PATH:process.env.PATH,HOME:home,NYXA_DATA_DIR:dataDir,NYXA_AGENT_MODE:'draft',NYXA_MCP_TOOL_PROFILE:'chatgpt_governed_execute'},stderr:'pipe'});
 const client=new Client({name:'discovery-e2e',version:'1.0.0'});
 await client.connect(transport);t.after(()=>client.close());
 const call=p=>client.callTool({name:'nyxa_propose_action',arguments:{proposal:p}}).then(parse);
 const original=origin(randomUUID());
 const held=await call(original);
 assert.equal(held.policy_decision,'HELD',JSON.stringify(held));
 assert.ok(held.discovery_candidate_proposal,JSON.stringify(held));
 const p=held.discovery_candidate_proposal.proposal;
 assert.equal(ProposalSchema.safeParse(p).success,true);
 assert.equal(p.claims[0].tag,'FACT');
 assert.match(p.claims[0].statement,/underlying claim remains unverified/);
 const write=await call(p);
 assert.equal(write.policy_decision,'ALLOW',JSON.stringify(write));
 assert.equal(write.result.status,'pending');
 const recall=parse(await client.callTool({name:'nyxa_memory_recall_candidates',arguments:{status:'pending',candidate_type:'open_question',limit:20}}));
 const id=JSON.parse(p.payload.content).claim_id;
 assert.equal(findExistingDiscoveryCandidate(id,recall.candidates)?.id,write.result.id);
 const again=await call(origin(randomUUID()));
 assert.equal(again.policy_decision,'HELD');
 assert.equal(again.existing_discovery_candidate_id,write.result.id);
 assert.equal(again.discovery_candidate_proposal,undefined);
 const updated=assessEpistemicStateSafely('recheck','same question',original.claims,original.uncertainty,TOOL_POLICIES[original.action]);
 assert.equal(updated.ran,true);assert.equal(updated.held,true);
 const stored=(await readFile(join(dataDir,'memory/candidates.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(stored.length,1);
 assert.equal(stored[0].status,'pending');
});
