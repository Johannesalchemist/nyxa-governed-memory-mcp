import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyEvidence} from '../experiments/evolution-evidence-gate-20261009.mjs';
const report=JSON.parse(readFileSync('/tmp/nyxa-evolution-measured-20261009.json','utf8'));
test('control data must not be misrepresented as independently verified evidence',()=>{
 const record={kind:report.kind,baseline:{hash:report.baselineImplementationHash,score:2},candidate:{hash:report.candidateImplementationHash,score:5},scenario:{hash:report.scenarioHash},holdout:{hash:report.scenarioHash},independentVerifier:{id:'',signatureVerified:false},authorityDelta:0,productionPromotion:false};
 const decision=verifyEvidence(record,{testResults:[{status:'PASS'}]});
 assert.equal(decision.outcome,'HOLD');
 assert.ok(decision.reasons.includes('not_measured_evidence'));
 assert.ok(decision.reasons.includes('independent_verification_missing'));
});
test('same scenario and holdout hash is a leakage risk',()=>assert.equal(report.scenarioHash,report.scenarioHash));
