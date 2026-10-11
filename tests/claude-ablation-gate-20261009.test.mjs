import test from 'node:test';import assert from 'node:assert/strict';import {evaluateAblation,arms} from '../experiments/claude-ablation-gate-20261009.mjs';
const rows=arms.map((arm,i)=>({arm,seed:1,score:i+1,cost:i+1,modelResponseVerified:true,isSynthetic:false}));
test('paired arms reach independent review only',()=>assert.equal(evaluateAblation(rows).status,'READY_FOR_INDEPENDENT_REVIEW'));
test('missing Claude response blocks claim',()=>assert.equal(evaluateAblation(rows.map((x,i)=>i===1?{...x,modelResponseVerified:false}:x)).status,'HOLD'));
test('missing arm blocks comparison',()=>assert.equal(evaluateAblation(rows.slice(0,2)).status,'HOLD'));
test('unpaired seed blocks comparison',()=>assert.equal(evaluateAblation([...rows,{...rows[0],seed:2}]).status,'HOLD'));
test('synthetic evidence blocks promotion',()=>assert.equal(evaluateAblation(rows.map(x=>({...x,isSynthetic:true}))).status,'HOLD'));
test('lift is relative to matching ablation arms',()=>{const x=evaluateAblation(rows);assert.equal(x.planLift,1);assert.equal(x.redteamLift,1)});
