import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFailureGenome, failureGenomeRetentionGate } from '../dist/organism/failureGenome.js';

const complete={
  id:'fg-hidden-operator-001',
  failureClass:'hidden_operator',
  exploitedAssumption:'single-channel provenance was sufficient',
  minimalReproductionRef:'evidence://repro/001',
  affectedInvariant:'no invisible authority accumulation',
  causalDiagnosis:'cross-channel influence escaped ancestry accounting',
  repairRef:'patch://repair/001',
  replayEvidenceRef:'evidence://replay/001',
  variantEvidenceRefs:['evidence://variant/001','evidence://variant/002'],
  regressionEvidenceRef:'evidence://regression/001',
  independentVerificationRef:'evidence://independent/001',
  authorityEffect:'NONE'
};

test('complete failure genome becomes retention evidence, never authority',()=>{
  const assessment=assessFailureGenome(complete);
  const gate=failureGenomeRetentionGate(complete);
  assert.equal(assessment.complete,true);
  assert.equal(gate.outcome,'RETENTION_EVIDENCE_READY');
  assert.equal(gate.authorityEffect,'NONE');
});

test('missing causal diagnosis fails closed',()=>{
  const gate=failureGenomeRetentionGate({...complete,causalDiagnosis:''});
  assert.equal(gate.outcome,'HOLD');
  assert.ok(gate.reasons.includes('causal_diagnosis_missing'));
});

test('successful replay without attack variants is not enough',()=>{
  const gate=failureGenomeRetentionGate({...complete,variantEvidenceRefs:[]});
  assert.equal(gate.outcome,'HOLD');
  assert.ok(gate.reasons.includes('variant_evidence_missing'));
});

test('independent verification is mandatory',()=>{
  const gate=failureGenomeRetentionGate({...complete,independentVerificationRef:''});
  assert.equal(gate.outcome,'HOLD');
  assert.ok(gate.reasons.includes('independent_verification_missing'));
});
