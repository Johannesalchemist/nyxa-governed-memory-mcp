import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';

const gateway=process.env.NYXA_JEFF_GATEWAY||'http://127.0.0.1:18743/v1/jeff-evidence';
const secretFile=process.env.NYXA_JEFF_GATE_SECRET_FILE||'/etc/nyxa/jeff-gateway.secret';
const output=process.env.NYXA_JEFF_PROJECTION||'/var/lib/nyxa-jeff-sync/jeff-memory-projection-v2.json';
const maxAge=Number(process.env.NYXA_JEFF_MAX_AGE_SECONDS||86400);
const now=Date.now();
const sha256=v=>createHash('sha256').update(v).digest('hex');
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
async function atomic(path,value){await mkdir(dirname(path),{recursive:true});const tmp=`${path}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(value)+'\n',{mode:0o644});const h=await open(tmp,'r');await h.sync();await h.close();await rename(tmp,path);}
function unavailable(reason){return {schema:'nyxa-jeff-projection-v2',status:'unavailable',reason,updated_at:new Date().toISOString(),classification:'NO_CURRENT_EVIDENCE',execution_authority:false};}
function validate(body){
 if(!exact(body,['schema','candidates','generated_at','classification','execution_authority'])||body.schema!=='nyxa-jeff-evidence-v2'||body.classification!=='UNTRUSTED_MEMORY_CANDIDATE'||body.execution_authority!==false||!Array.isArray(body.candidates)||body.candidates.length!==1)throw Error('gateway_schema_invalid');
 const c=body.candidates[0],keys=['id','content','candidate_type','source','scope','purpose','confidence','importance','status','createdAt','writtenAt','writtenBy','taskId','runId','provenance','trust'];
 if(!exact(c,keys)||typeof c.id!=='string'||typeof c.content!=='string'||c.content.length<1||c.content.length>4000||c.candidate_type!=='observation'||c.source!=='tool'||c.scope!=='project'||c.status!=='pending'||c.taskId!=='jeff-evidence-persistence'||c.trust!=='UNTRUSTED_MEMORY_CANDIDATE')throw Error('candidate_schema_invalid');
 const written=Date.parse(c.writtenAt);if(!Number.isFinite(written)||written>now+300000||now-written>maxAge*1000)throw Error('candidate_stale');
 return c;
}
let projection;
try{
 const secret=(await readFile(secretFile,'utf8')).trim();if(secret.length<24)throw Error('gateway_secret_invalid');
 const response=await fetch(gateway,{method:'POST',headers:{'content-type':'application/json','x-nyxa-gate-secret':secret},body:'{}',signal:AbortSignal.timeout(10000)});
 const body=await response.json();if(!response.ok)throw Error(`gateway_${response.status}_${body?.error||'error'}`);
 const c=validate(body);const expires=new Date(Date.parse(c.writtenAt)+maxAge*1000).toISOString();
 projection={schema:'nyxa-jeff-projection-v2',status:'ready',updated_at:new Date().toISOString(),expires_at:expires,source:{gateway:'authenticated_local_gateway',candidate_id:c.id,content_sha256:sha256(c.content),provenance:c.provenance},classification:'UNVERIFIED_ADVISORY_EVIDENCE',execution_authority:false,candidate:c};
}catch(error){projection=unavailable(String(error?.message||'sync_failed').slice(0,160));process.exitCode=1;}
await atomic(output,projection);
console.log(JSON.stringify({status:projection.status,updated_at:projection.updated_at,reason:projection.reason||null,candidate_id:projection.source?.candidate_id||null}));
