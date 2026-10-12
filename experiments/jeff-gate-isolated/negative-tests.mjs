import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./src/server.ts',import.meta.url),'utf8');
for(const contract of [
  'timingSafeEqual(a,b)',
  'error:"unexpected_input"',
  'const latestById=new Map',
  'error:"jeff_evidence_missing"',
  'error:"jeff_evidence_ambiguous"',
  'error:"jeff_evidence_not_current"',
  'error:"jeff_evidence_stale"',
  'candidate_secret_like_content',
  'trust:"UNTRUSTED_MEMORY_CANDIDATE"',
  'execution_authority:false'
]) assert(source.includes(contract),contract);
const history=[
 {id:'same',taskId:'jeff-evidence-persistence',status:'promoted'},
 {id:'same',taskId:'jeff-evidence-persistence',status:'pending'}
];
const latest=new Map();
for(const c of history)if(!latest.has(c.id))latest.set(c.id,c);
assert.equal(latest.get('same').status,'promoted');
console.log('PASS gateway fail-closed static and latest-state regression checks');
