import test from 'node:test';
import assert from 'node:assert/strict';
import { toolbox } from '../dist/toolbox/registry.js';
const request = {version:'nyxa.remote-job.v1',target:'server-c',kind:'simulation.status',jobId:'job-1',actorId:'actor-1',mandateId:'mandate-1',evidenceId:'evidence-1',maxRuntimeSeconds:30};
test('remote preflight is registered read-only',()=>{const d=toolbox.describe('remote.job.preflight');assert.equal(d?.risk,'read');assert.equal(d?.connector,'server-c-unreal');});
test('valid envelope cannot execute',async()=>{const r=await toolbox.execute('remote.job.preflight',{request});assert.deepEqual({valid:r.validEnvelope,authority:r.authority,executable:r.executable},{valid:true,authority:'NONE',executable:false});});
test('injected command is rejected',async()=>{const r=await toolbox.execute('remote.job.preflight',{request:{...request,command:'bash'}});assert.equal(r.validEnvelope,false);assert.equal(r.executable,false);});
