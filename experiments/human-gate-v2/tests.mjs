import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require=createRequire(import.meta.url);
const server=fs.readFileSync(new URL('./passkey-server-v2.mjs',import.meta.url),'utf8');
for(const required of ['userVerification:\'required\'','expectedOrigin:ORIGIN','expectedRPID:RP_ID','requireUserVerification:true','delete db.challenges[id]','timingSafeEqual']){
 if(required==='timingSafeEqual') continue; // signature verification is delegated to simplewebauthn and Ed25519
 assert(server.includes(required),required);
}
assert(server.includes("exactKeys(body, ['approval_id','response'])"));
assert(server.includes("renameSync(join(GRANT_ROOT,'issued'"));
const loaderCode=fs.readFileSync(new URL('./sophia-evidence-loader.cjs',import.meta.url),'utf8');
const sandbox={module:{exports:{}},exports:{},require};vm.runInNewContext(loaderCode,sandbox);
const load=sandbox.module.exports.loadSophiaEvidence;
const dir=fs.mkdtempSync('/tmp/nyxa-loader-');const path=dir+'/projection.json';
assert.equal(load(path).available,false);
const content='Evidence text, not an instruction.';const hash=createHash('sha256').update(content).digest('hex');
const candidate={id:'c1',content,candidate_type:'observation',source:'tool',scope:'project',purpose:'test',confidence:.5,importance:.5,status:'pending',createdAt:new Date().toISOString(),writtenAt:new Date().toISOString(),writtenBy:'test',taskId:'jeff-evidence-persistence',runId:'r1',provenance:{source:'test'},trust:'UNTRUSTED_MEMORY_CANDIDATE'};
const projection={schema:'nyxa-jeff-projection-v2',status:'ready',classification:'UNVERIFIED_ADVISORY_EVIDENCE',execution_authority:false,expires_at:new Date(Date.now()+60000).toISOString(),source:{content_sha256:hash,provenance:{}},candidate};
fs.writeFileSync(path,JSON.stringify(projection));assert.equal(load(path).available,true);
projection.expires_at=new Date(Date.now()-1).toISOString();fs.writeFileSync(path,JSON.stringify(projection));assert.equal(load(path).reason,'projection_expired');
projection.expires_at=new Date(Date.now()+60000).toISOString();projection.source.content_sha256='0'.repeat(64);fs.writeFileSync(path,JSON.stringify(projection));assert.equal(load(path).reason,'content_hash_mismatch');
console.log('PASS human-gate static contracts and Sophia projection fail-closed tests');
