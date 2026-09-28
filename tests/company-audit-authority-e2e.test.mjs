import { CandidateStore } from '../dist/memory/candidateStore.js';
import { createServer } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rename, symlink, unlink, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const A = { tenant_id: '11111111-1111-4111-8111-111111111111', organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', audit_id: '5f6e5d42-4d66-4f43-9d0f-8c3e99d15a01' };
const B = { tenant_id: '22222222-2222-4222-8222-222222222222', organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', audit_id: '5f6e5d42-4d66-4f43-9d0f-8c3e99d15a02' };
const target = r => `company-audit:/tenant/${r.tenant_id}/organization/${r.organization_id}/audit/${r.audit_id}`;
const parse = r => JSON.parse(r.content[0].text);
const registry = { version: 1, memberships: [A, B].map((r,i) => ({ principal: `principal-${i ? 'b' : 'a'}`, tenant_id: r.tenant_id, organizations: [{ organization_id: r.organization_id, permissions: ['read','write'], audit_ids: [r.audit_id] }] })) };
function proposal(r, overrides = {}) {
  return { actor: 'untrusted-actor', action: 'nyxa_company_audit_record', target: target(r), scope: 'untrusted-scope',
    claims: [{ tag: 'FACT', statement: 'Synthetic company authority test fixture', source: 'test' }], uncertainty: 0,
    requestedCapabilityClass: 'I1', estimatedIrreversibility: 'I1',
    provenance: { taskId: 'company-authority-test', runId: crypto.randomUUID(), requestingIdentity: 'spoofed-principal-b' },
    payload: { ...r, category: 'company', field_path: 'company.name', value: 'synthetic-test', epistemic_type: 'CLAIM', source: 'system', confidence: 1, evidence_status: 'NONE', observed_at: new Date().toISOString(), speaker: 'untrusted-speaker' },
    ...overrides };
}
async function spawnServer(base, principal, label) {
  const home = join(base, `home-${label}`); await mkdir(home);
  const args = [resolve('dist/index.js')];
  if (principal) args.push(`--company-principal=${principal}`, `--company-authority-file=${base}/authority.json`);
  const transport = new StdioClientTransport({ command: '/usr/bin/node', args, cwd: base,
    env: { PATH: '/usr/bin:/bin', HOME: home, NYXA_DATA_DIR: join(base,'data'), NYXA_AGENT_MODE: 'draft', NYXA_MCP_TOOL_PROFILE: 'chatgpt_governed_execute' }, stderr: 'pipe' });
  let stderr = ''; transport.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({ name: 'spoofed-principal-b', version: '1.0.0' });
  try { await client.connect(transport, { timeout: 10000 }); }
  catch (error) {
    await writeFile(join(base, `${label}-stderr.log`), stderr);
    await client.close().catch(() => {});
    throw new Error(`HARNESS_STARTUP_FAILURE ${error.message}: ${stderr}; diagnostics=${base}`);
  }
  const osArgs = (await readFile(`/proc/${transport.pid}/cmdline`,'utf8')).split('\0');
  if (principal) assert.ok(osArgs.includes(`--company-principal=${principal}`),'kernel-observed child argv must contain the launcher binding');
  return { client, close: async () => { await client.close(); await writeFile(join(base, `${label}-stderr.log`), stderr); } };
}
async function bytes(base) { return readFile(join(base,'data/company-audit/observations.jsonl')); }
const write = async (s,p) => parse(await s.client.callTool({ name: 'nyxa_propose_action', arguments: { proposal: p } }));
const read = async (s,r) => parse(await s.client.callTool({ name: 'nyxa_company_audit_read', arguments: r }));
async function personalSnapshot(base) {
  const result = {};
  async function visit(path, key) {
    for (const entry of await readdir(path, {withFileTypes:true})) {
      if (entry.isDirectory()) await visit(join(path,entry.name),key+'/'+entry.name);
      else if (entry.isFile()) result[key+'/'+entry.name]=(await readFile(join(path,entry.name))).toString('base64');
    }
  }
  for (const name of await readdir(join(base,'data'),{withFileTypes:true})) {
    if (name.isDirectory() && name.name !== 'company-audit' && !/audit|replay|grant|mandate/.test(name.name)) await visit(join(base,'data',name.name),name.name);
  }
  return result;
}
const trace = async s => parse(await s.client.callTool({ name: 'audit.trace', arguments: { limit: 100 } }));

test('compiled MCP: principal binding, tenant/org/audit membership, spoofing, read, revocation and replay', { timeout: 60000 }, async t => {
  const base = await mkdtemp('/tmp/nyxa-ca-');
  execFileSync('/usr/bin/setfacl', ['-m','u:nyxamcp:rwx,d:u:nyxamcp:rwx',base]);
  await writeFile(join(base,'authority.json'), JSON.stringify(registry), { mode: 0o600 });
  await chmod(join(base,'authority.json'),0o600);
  // Offline fixture setup; no grant/mandate is issued, and no running process owns this data yet.
  const candidates = new CandidateStore(join(base,'data')); await candidates.init();
  await candidates.writeCandidate({content:'PERSONAL-CANARY-NOT-FOR-COMPANY',candidate_type:'observation',source:'user',scope:'personal',purpose:'isolation fixture',confidence:1,importance:0.5},{writtenBy:'fixture',taskId:'fixture',runId:'fixture'},{outcome:'ALLOW',domain:null,reason:'offline test setup'});
  const evidence = []; let current;
  t.after(async () => { if (current) await current.close(); await writeFile(join(base,'stdout.log'),JSON.stringify(evidence,null,2)); });
  async function deny(label, action, reason) {
    const before = await bytes(base);
    const priorAuditIds = new Set((await trace(current)).events.map(e=>e.id));
    const result = await action();
    const after = await bytes(base);
    const audit = await trace(current);
    assert.equal(result.policy_decision,'DENY',JSON.stringify(result));
    assert.equal(result.domain,'TENANT_AUTHORITY');
    assert.equal(result.observations,undefined,'DENY must disclose no observations');
    assert.equal(result.reason,reason);
    assert.deepEqual(after,before,'DENY must leave the complete Company Audit file byte-identical');
    assert.equal(audit.integrity.valid,true);
    const event = audit.events.findLast(e => e.action === 'company.authority');
    assert.equal(priorAuditIds.has(event.id),false,'DENY must create a new audit event');
    assert.equal(event.policy_decision,'DENIED'); assert.equal(event.details.domain,'TENANT_AUTHORITY'); assert.equal(event.result_status,reason);
    evidence.push({ label,result,no_company_effect:true,event });
  }
  async function allow(label,r,principal) {
    const before=await bytes(base); const p=proposal(r); p.payload.evidence_status='VERIFIED'; const personalBefore=await personalSnapshot(base); const result=await write(current,p);
    assert.equal(result.policy_decision,'ALLOW',JSON.stringify(result));
    const after=await bytes(base); assert.equal(after.subarray(0,before.length).equals(before),true);
    const added=after.subarray(before.length).toString().trim().split('\n').map(JSON.parse);
    assert.equal(added.length,1); assert.equal(added[0].id,result.result.id); assert.equal(added[0].writtenBy,principal);
    assert.equal(added[0].tenant_id,r.tenant_id); assert.equal(added[0].organization_id,r.organization_id);
    assert.deepEqual(await personalSnapshot(base),personalBefore,'Company write must not mutate personal/learning stores');
    const permitted=await read(current,r); assert.match(permitted.epistemic_notice,/caller assertions/); assert.ok(permitted.observations.some(o=>o.id===added[0].id));
    const audit=await trace(current); assert.equal(audit.integrity.valid,true);
    assert.ok(audit.events.some(e=>e.action==='company.authority' && e.policy_decision==='ALLOWED' && e.requesting_identity===principal));
    evidence.push({label,result,append:added[0],read:permitted,audit});
    return p;
  }
  current=await spawnServer(base,null,'personal-control');
  const personalRead=parse(await current.client.callTool({name:'nyxa_memory_recall_candidates',arguments:{}}));
  assert.ok(personalRead.candidates.some(c=>c.content==='PERSONAL-CANARY-NOT-FOR-COMPANY'));
  const controlWrite=await write(current,proposal(A,{action:'nyxa_memory_store_candidate',target:'memory:/candidate',payload:{content:'PERSONAL-WRITE-POSITIVE-CONTROL',candidate_type:'observation',source:'tool',scope:'project',purpose:'positive control',confidence:1,importance:0.5}}));
  assert.equal(controlWrite.policy_decision,'ALLOW',JSON.stringify(controlWrite));
  await current.close();current=undefined;
  current=await spawnServer(base,'principal-b','b'); await allow('B -> B',B,'principal-b'); await current.close(); current=undefined;
  current=await spawnServer(base,'principal-a','a'); const valid=await allow('A -> A despite spoofed clientInfo/actor/requestingIdentity',A,'principal-a');
  assert.deepEqual((await current.client.listTools()).tools.map(t=>t.name).sort(),['audit.trace','nyxa_company_audit_read','nyxa_propose_action']);
  await deny('personal memory read denied with real personal data present',()=>current.client.callTool({name:'nyxa_memory_recall_candidates',arguments:{}}).then(parse),'company_session_tool_denied');
  const personalBefore=await personalSnapshot(base);
  const memoryPayload={content:'COMPANY-CANARY-NOT-FOR-PERSONAL',candidate_type:'observation',source:'tool',scope:'project',purpose:'backflow probe',confidence:1,importance:0.5};
  await deny('company to learning/personal backflow',()=>write(current,proposal(A,{action:'nyxa_memory_store_candidate',target:'memory:/candidate',payload:memoryPayload})),'company_session_action_denied');
  await deny('dream cannot absorb Company data',()=>write(current,proposal(A,{action:'nyxa_dream_trigger',target:'memory:/dream'})),'company_session_action_denied');
  assert.deepEqual(await personalSnapshot(base),personalBefore);
  assert.ok(!JSON.stringify(await trace(current)).includes('PERSONAL-CANARY-NOT-FOR-COMPANY'));
  assert.ok((await trace(current)).events.every(e=>e.requesting_identity==='principal-a'));
  await deny('coherent B payload + B target by A',()=>write(current,proposal(B)),'tenant_membership_missing');
  for (const field of ['tenant_id','organization_id','audit_id']) {
    const changed={...A,[field]:B[field]};
    await deny(`spoofed ${field}: payload-only`,()=>write(current,proposal(changed,{target:target(A)})),'company_audit_target_or_payload_invalid');
    await deny(`spoofed ${field}: target-only`,()=>write(current,proposal(A,{target:target(changed)})),'company_audit_target_or_payload_invalid');
  }
  await deny('coherent organization outside A scope',()=>write(current,proposal({...A,organization_id:B.organization_id})),'organization_scope_denied');
  await deny('coherent audit outside A scope',()=>write(current,proposal({...A,audit_id:B.audit_id})),'audit_scope_denied');
  await deny('direct read A -> B with actual B data present',()=>read(current,B),'tenant_membership_missing');
  // Positive control proves a network destination is reachable; Company Audit must not send to it.
  let received=0;const sink=createServer((req,res)=>{received++;res.end('ok');});
  await new Promise(resolve=>sink.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${sink.address().port}/company-export`;
    await fetch(url);assert.equal(received,1);
    await deny('Company Audit external target with reachable receiver',()=>write(current,proposal(A,{target:url})),'company_audit_target_or_payload_invalid');
    assert.equal(received,1,'No request must reach the external receiver');
  } finally { await new Promise(resolve=>sink.close(resolve)); }
  const before=await bytes(base); const replay=await write(current,valid); assert.equal(replay.policy_decision,'DENY'); assert.deepEqual(await bytes(base),before); evidence.push({label:'replay',result:replay,no_company_effect:true,audit:await trace(current)});
  await writeFile(join(base,'authority.json'),JSON.stringify({version:1,memberships:registry.memberships.filter(m=>m.principal!=='principal-a')}));
  await deny('revocation write',()=>write(current,proposal(A)),'tenant_membership_missing');
  await deny('revocation read',()=>read(current,A),'tenant_membership_missing');
  const restricted = structuredClone(registry);
  restricted.memberships[0].organizations[0].permissions = ['read'];
  await writeFile(join(base,'authority.json'),JSON.stringify(restricted));
  await deny('read-only membership cannot write',()=>write(current,proposal(A)),'permission_denied');
  assert.equal((await read(current,A)).count,1);
  await chmod(join(base,'authority.json'),0o666);
  await deny('writable registry rejected',()=>read(current,A),'authority_registry_invalid');
  await chmod(join(base,'authority.json'),0o600);
  await rename(join(base,'authority.json'),join(base,'authority-real.json'));
  await symlink(join(base,'authority-real.json'),join(base,'authority.json'));
  await deny('registry symlink rejected',()=>read(current,A),'authority_registry_invalid');
  await unlink(join(base,'authority.json'));
  await rename(join(base,'authority-real.json'),join(base,'authority.json'));
  await writeFile(join(base,'authority.json'),' '.repeat(65537));
  await deny('oversize registry rejected',()=>read(current,A),'authority_registry_invalid');
  const duplicateTenant = structuredClone(registry);
  duplicateTenant.memberships.push(structuredClone(duplicateTenant.memberships[0]));
  await writeFile(join(base,'authority.json'),JSON.stringify(duplicateTenant));
  await deny('duplicate principal tenant binding fails closed',()=>read(current,A),'authority_registry_ambiguous');
  const duplicateOrg = structuredClone(registry);
  duplicateOrg.memberships[0].organizations.push(structuredClone(duplicateOrg.memberships[0].organizations[0]));
  await writeFile(join(base,'authority.json'),JSON.stringify(duplicateOrg));
  await deny('duplicate organization binding fails closed',()=>read(current,A),'authority_registry_ambiguous');
  await writeFile(join(base,'authority.json'),'invalid');
  await deny('malformed registry',()=>read(current,A),'authority_registry_invalid');
  await current.close(); current=undefined;
  current=await spawnServer(base,null,'unbound');
  await deny('unbound process write',()=>write(current,proposal(A)),'principal_binding_missing');
  await deny('unbound process read',()=>read(current,A),'principal_binding_missing');
  console.log(JSON.stringify({evidence_directory:base,cases:evidence.length}));
});
