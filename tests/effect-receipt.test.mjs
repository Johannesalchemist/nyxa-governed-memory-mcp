import test from 'node:test'; import assert from 'node:assert/strict';
import {buildKernelEffectReceipt,verifyKernelEffectReceipt} from '../dist/governance/effectReceipt.js';
const base={version:'nyxa.kernel.v1',actor:'a',action:'x',target:'scratch:/x',scope:'s'};
for(const [effectClass,verification,good,bad] of [['read','none','none','handler-receipt'],['reversible','receipt','handler-receipt','none'],['irreversible','independent','independent','handler-receipt']]){
 test(`${effectClass} verification requirement is enforced`,()=>{const e={...base,effectClass,authorityRequired:effectClass!=='read',verification}; const ok=buildKernelEffectReceipt(e,'succeeded',good); assert.equal(ok.verified,true); assert.equal(verifyKernelEffectReceipt(e,ok),true); const no=buildKernelEffectReceipt(e,'succeeded',bad); assert.equal(no.verified,false); assert.equal(verifyKernelEffectReceipt(e,no),false);});
}
test('receipt is bound to exact envelope',()=>{const e={...base,effectClass:'reversible',authorityRequired:true,verification:'receipt'}; const r=buildKernelEffectReceipt(e,'succeeded','handler-receipt'); assert.equal(verifyKernelEffectReceipt({...e,target:'scratch:/other'},r),false);});
test('failed execution can never be verified',()=>{const e={...base,effectClass:'read',authorityRequired:false,verification:'none'}; const r=buildKernelEffectReceipt(e,'failed','none'); assert.equal(r.verified,false); assert.equal(verifyKernelEffectReceipt(e,r),false);});
