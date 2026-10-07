import test from 'node:test'; import assert from 'node:assert/strict'; import { performance } from 'node:perf_hooks';
import { buildKernelEffectEnvelope } from '../dist/governance/kernelContract.js';
import { buildKernelEffectReceipt } from '../dist/governance/effectReceipt.js';
import { enforcePolicy } from '../dist/policy/enforcePolicy.js';
const p={actor:'perf',action:'nyxa_read_file',target:'root:/x',scope:'perf',provenance:{taskId:'t',source:'perf'}};
function p95(xs){xs.sort((a,b)=>a-b);return xs[Math.floor(xs.length*.95)];}
test('mass-use: direct I0 policy fast path stays local and sub-millisecond p95',()=>{const xs=[];for(let i=0;i<20000;i++){const a=performance.now();const d=enforcePolicy('nyxa_read_file','observe_only');xs.push(performance.now()-a);assert.equal(d.allowed,true);} const v=p95(xs);console.log(`Kernel I0 policy p95=${v.toFixed(4)}ms n=20000`);assert.ok(v<1,`p95 ${v}ms`);});
test('mass-use: envelope plus receipt construction stays sub-millisecond p95',()=>{const policy={capabilityClass:'I1',writesAuthoritativeMemory:false};const xs=[];for(let i=0;i<20000;i++){const a=performance.now();const c=buildKernelEffectEnvelope({...p,action:'x'},policy);if(!c.allowed)throw Error('contract');buildKernelEffectReceipt(c.envelope,'succeeded','handler-receipt');xs.push(performance.now()-a);}const v=p95(xs);console.log(`Kernel contract+receipt p95=${v.toFixed(4)}ms n=20000`);assert.ok(v<1,`p95 ${v}ms`);});
