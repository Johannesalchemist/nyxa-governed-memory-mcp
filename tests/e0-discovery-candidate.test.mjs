import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryCandidateFromE0 } from '../dist/epistemic/discoveryCandidate.js';
import { StoreCandidateInputSchema } from '../dist/schema/candidates.js';
import { e0Triage } from '../dist/epistemic/e0.js';

test('known evidence produces no candidate', () => {
  const r=e0Triage({claim_id:'known',statement:'known',evidence_strength:.95,provenance_quality:.95,impact_score:.2});
  assert.equal(discoveryCandidateFromE0('known','known',r),undefined);
});
test('unresolved high-impact claim produces valid inert pending proposal payload', () => {
  const r=e0Triage({claim_id:'open',statement:'unresolved',evidence_strength:.2,provenance_quality:.2,impact_score:.9,contradiction_score:.8});
  const candidate=discoveryCandidateFromE0('open','unresolved',r);
  assert.equal(StoreCandidateInputSchema.strict().safeParse(candidate).success,true);
  assert.equal(candidate.candidate_type,'open_question');
  assert.equal(candidate.scope,'project');
  assert.equal(candidate.status,undefined);
  assert.equal(JSON.parse(candidate.content).claim_id,'open');
});

test('recall finds pending matching question and ignores unrelated or promoted records', async () => {
  const { findExistingDiscoveryCandidate } = await import('../dist/epistemic/discoveryCandidate.js');
  const sample = (id, status, claim) => ({id, status, candidate_type:'open_question', scope:'project', content:JSON.stringify({kind:'e0_discovery_v1',claim_id:claim})});
  assert.equal(findExistingDiscoveryCandidate('x',[sample('old','promoted','x'),sample('match','pending','x')])?.id,'match');
  assert.equal(findExistingDiscoveryCandidate('x',[sample('other','pending','y')]),undefined);
  assert.equal(findExistingDiscoveryCandidate('x',[{...sample('broken','pending','x'),content:'{'}]),undefined);
});

test('stable discovery identity survives new task and run identifiers', async () => {
  const {discoveryQuestionId}=await import('../dist/epistemic/discoveryCandidate.js');
  assert.equal(discoveryQuestionId('action','resource'),discoveryQuestionId('action','resource'));
  assert.notEqual(discoveryQuestionId('action','resource'),discoveryQuestionId('action','other'));
});
test('full discovery proposal parses with unverified SRM evidence and original provenance', async () => {
  const {buildDiscoveryStoreProposal}=await import('../dist/epistemic/discoveryCandidate.js');
  const {ProposalSchema}=await import('../dist/governance/proposal.js');
  const original={actor:'agent',action:'nyxa_self_model_write_goal',target:'goal:/1',scope:'project',claims:[{tag:'HYPOTHESIS',statement:'uncertain',source:'agent'}],uncertainty:.8,requestedCapabilityClass:'I1',estimatedIrreversibility:'I1',provenance:{taskId:'task',runId:'run',requestingIdentity:'agent'}};
  const r=e0Triage({claim_id:'x',statement:'uncertain',evidence_strength:.1,provenance_quality:.1,impact_score:.9});
  const payload=discoveryCandidateFromE0('x','uncertain',r);
  const proposal=buildDiscoveryStoreProposal(original,payload);
  assert.equal(ProposalSchema.safeParse(proposal).success,true);
  assert.equal(proposal.claims[0].tag,'FACT');
  assert.match(proposal.claims[0].statement,/underlying claim remains unverified/);
  assert.deepEqual(proposal.provenance,original.provenance);
  assert.equal(proposal.payload.candidate_type,'open_question');
});

test('same action and target with different underlying questions are not merged',async()=>{
 const {discoveryQuestionId}=await import('../dist/epistemic/discoveryCandidate.js');
 const a=[{tag:'HYPOTHESIS',statement:'Will X fail?',source:'agent'}];
 const b=[{tag:'HYPOTHESIS',statement:'Will Y fail?',source:'agent'}];
 assert.notEqual(discoveryQuestionId('act','target',a),discoveryQuestionId('act','target',b));
 assert.equal(discoveryQuestionId('act','target',a),discoveryQuestionId('act','target',[{...a[0],source:'other'}]));
});
