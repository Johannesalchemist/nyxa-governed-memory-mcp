import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rename, symlink, link, unlink, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { CompanyAuditStore } from '../dist/company-audit/store.js';
import { safeJsonStringify } from '../dist/utils/safeJson.js';
const r=['11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','5f6e5d42-4d66-4f43-9d0f-8c3e99d15a01'];

test('Company Audit file reads reject symlink, hardlink, oversize and rehashed replacement without changing files', async () => {
 const base=await mkdtemp('/tmp/nyxa-ca-fs-');const store=new CompanyAuditStore(base);await store.init();
 await store.writeObservation(`company-audit:/tenant/${r[0]}/organization/${r[1]}/audit/${r[2]}`,{tenant_id:r[0],organization_id:r[1],audit_id:r[2],category:'company',field_path:'name',value:'fixture',epistemic_type:'CLAIM',source:'system',confidence:1,evidence_status:'NONE',observed_at:new Date().toISOString(),speaker:'fixture'},{writtenBy:'fixture',taskId:'fixture',runId:'fixture'},{outcome:'ALLOW',domain:null,reason:'fixture'});
 const file=join(base,'company-audit/observations.jsonl');const original=await readFile(file);assert.equal((await store.readAudit(...r)).length,1);
 await rename(file,file+'.real');await symlink(file+'.real',file);
 await assert.rejects(store.readAudit(...r),/ELOOP/);assert.deepEqual(await readFile(file+'.real'),original);
 await assert.rejects(new CompanyAuditStore(base).init(),/ELOOP/);assert.deepEqual(await readFile(file+'.real'),original);
 await unlink(file);await rename(file+'.real',file);
 await link(file,file+'.link');await assert.rejects(store.readAudit(...r),/not_bounded/);assert.deepEqual(await readFile(file),original);await unlink(file+'.link');
 await truncate(file,32*1024*1024+1);await assert.rejects(store.readAudit(...r),/not_bounded/);await writeFile(file,original);
 const changed=JSON.parse(original.toString());changed.value='rehashed-tamper';const {eventHash,...rest}=changed;changed.eventHash=createHash('sha256').update(safeJsonStringify(rest)).digest('hex');
 const tampered=Buffer.from(safeJsonStringify(changed)+'\n');await writeFile(file,tampered);await assert.rejects(store.readAudit(...r),/chain_changed/);assert.deepEqual(await readFile(file),tampered);
 await writeFile(file,original);await rename(join(base,'company-audit'),join(base,'real'));await symlink(join(base,'real'),join(base,'company-audit'));
 await assert.rejects(store.readAudit(...r),/directory_alias/);assert.deepEqual(await readFile(join(base,'real/observations.jsonl')),original);
});
