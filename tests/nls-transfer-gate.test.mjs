import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateSemanticTransfer} from '../dist/semantic/transferGate.js';
const evidence=(patch={})=>({baselineCorrect:80,transferCorrect:90,holdoutCount:100,independent:true,holdoutUntouched:true,provenanceRef:'verifier:test',authorityDrift:0,...patch});
test('positive independent holdout only permits candidate, not authority',()=>{const d=evaluateSemanticTransfer(evidence());assert.equal(d.decision,'ALLOW_CANDIDATE');assert.equal(d.authorityEffect,'NONE')});
test('negative and zero transfer are held',()=>{for(const n of [80,70])assert.equal(evaluateSemanticTransfer(evidence({transferCorrect:n})).decision,'HOLD')});
test('self-attested or touched holdout held',()=>{for(const p of [{independent:false},{holdoutUntouched:false},{provenanceRef:''}])assert.equal(evaluateSemanticTransfer(evidence(p)).decision,'HOLD')});
test('invalid counts, insufficient sample and drift fail closed',()=>{for(const p of [{holdoutCount:99},{transferCorrect:101},{baselineCorrect:NaN},{authorityDrift:1}])assert.equal(evaluateSemanticTransfer(evidence(p)).decision,'HOLD')});
