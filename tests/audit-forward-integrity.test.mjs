import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,symlink,link} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AuditLog} from "../dist/audit/AuditLog.js";
const event=(id)=>({id,timestamp:new Date().toISOString(),actor:"test",action:"probe",
 tool:"audit-proof",mode:"observe_only",backend:"test",result:"allowed"});
const sandbox=()=>mkdtemp(join(tmpdir(),"nyxa-audit-guard-"));
test("existing broken audit chain forbids fresh appends without changing bytes",async()=>{
 const dir=await sandbox(),audit=new AuditLog(dir);
 await audit.init();await audit.append(event("one"));await audit.append(event("two"));
 const p=join(dir,"audit.log.jsonl"),raw=await readFile(p,"utf8");
 const corrupt=raw.replace('"id":"one"','"id":"tampered"');
 assert.notEqual(raw,corrupt);
 await writeFile(p,corrupt);
 await assert.rejects(audit.append(event("three")) ,/audit_ledger_invalid/);
 assert.equal(await readFile(p,"utf8"),corrupt);
 await assert.rejects(new AuditLog(dir).init(),/audit_log_init_failed/);
 assert.equal(await readFile(p,"utf8"),corrupt);
});
test("truncated audit chain blocks append and restart",async()=>{
 const dir=await sandbox(),audit=new AuditLog(dir);
 await audit.init();await audit.append(event("one"));
 const p=join(dir,"audit.log.jsonl"),raw=await readFile(p,"utf8");
 await writeFile(p,raw.trimEnd());
 await assert.rejects(audit.append(event("two")),/audit_ledger_truncated/);
 assert.equal(await readFile(p,"utf8"),raw.trimEnd());
 await assert.rejects(new AuditLog(dir).init(),/audit_log_init_failed/);
});
test("symlinked audit ledger rejects initialization without damaging its target",async()=>{
 const dir=await sandbox(),victim=join(dir,"victim.txt");
 await writeFile(victim,"unaltered");
 await symlink(victim,join(dir,"audit.log.jsonl"));
 await assert.rejects(new AuditLog(dir).init(),/audit_log_init_failed/);
 assert.equal(await readFile(victim,"utf8"),"unaltered");
});
test("hardlinked audit ledger is not considered a safe append target",async()=>{
 const dir=await sandbox(),victim=join(dir,"victim.txt");
 await writeFile(victim,"unaltered\n");
 await link(victim,join(dir,"audit.log.jsonl"));
 await assert.rejects(new AuditLog(dir).init(),/audit_log_init_failed/);
 assert.equal(await readFile(victim,"utf8"),"unaltered\n");
});
test("inserting an unhashed event after a hashed epoch fails closed",async()=>{
 const dir=await sandbox(),audit=new AuditLog(dir);
 await audit.init();await audit.append(event("one"));
 const p=join(dir,"audit.log.jsonl"),raw=await readFile(p,"utf8");
 const forged=raw+JSON.stringify({id:"legacy-forged",timestamp:new Date().toISOString()})+"\n";
 await writeFile(p,forged);
 const verifier=await audit.verifyIntegrity();
 assert.equal(verifier.valid,false);
 assert.equal(verifier.reason,"unhashed_event_after_chained_epoch");
 await assert.rejects(audit.append(event("two")),/audit_ledger_invalid/);
 assert.equal(await readFile(p,"utf8"),forged);
});
test("a missing safe ledger gets initialized with a valid genesis",async()=>{
 const dir=await sandbox(),audit=new AuditLog(dir);
 await audit.init();await audit.append(event("genesis"));
 const integrity=await audit.verifyIntegrity();
 assert.equal(integrity.valid,true);assert.equal(integrity.checked,1);
});
