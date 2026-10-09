// ELM-001: deterministic integration contract, NOT proof of autonomous learning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchProviderRegistry, RoutedResearchProvider } from '../dist/epistemic/researchRouter.js';
import { evaluateLearningRatchet } from '../dist/organism/learningRatchet.js';
import { MockResearchProvider } from '../dist/epistemic/researchAgent.js';

const request = (i) => ({ claim_id:`elm-${i}`, statement: i%3===0?'__ESCALATES__':i%3===1?'__RESOLVES__':'__NO_GAIN__', evidence_packet:{claim_id:`elm-${i}`,statement:'synthetic',evidence_strength:0.2,provenance_quality:0.2} });
const registry = new ResearchProviderRegistry({jevProviderId:'jev-mock',externalProviderIds:['reviewer-a','reviewer-b']})
 .register({id:'jev-mock',provider:new MockResearchProvider(),external:false,modelVersion:'mock-v1'})
 .register({id:'reviewer-a',provider:new MockResearchProvider(),external:true})
 .register({id:'reviewer-b',provider:new MockResearchProvider(),external:true});
const local = new RoutedResearchProvider(registry,'LOCAL_JEV');
const independent = new RoutedResearchProvider(registry,'INDEPENDENT_CHECK');

test('ELM-001 routes 30 distinct synthetic research cases and 30 independent checks without authority', async()=>{
  for(let i=0;i<30;i++){
    const q=request(i); const [a,b]=await Promise.all([local.research(q),independent.research(q)]);
    assert.ok(a.provenance_refs.length>=1);
    assert.ok(b.provenance_refs.length>=2);
    assert.equal('authority' in a,false);
    assert.equal('authority' in b,false);
    assert.equal('action' in b,false);
  }
});

test('ELM-001 ratchet blocks unverified synthetic improvements',()=>{
 const base={resistance:5,legitimateCapability:10,recoveryCost:1,complexityCost:1,authority:0};
 const candidate={...base,resistance:7};
 const input={failureClass:'research_error',baseline:base,candidate,originalAttackBlocked:true,variantAttackBlocked:true,regressionPassed:true,independentVerificationPassed:false};
 assert.equal(evaluateLearningRatchet(input).outcome,'HOLD');
 assert.ok(evaluateLearningRatchet(input).reasons.includes('independent_verification_missing'));
 assert.equal(evaluateLearningRatchet({...input,independentVerificationPassed:true}).outcome,'RETAIN_CANDIDATE');
 assert.equal(evaluateLearningRatchet({...input,independentVerificationPassed:true,candidate:{...candidate,authority:1}}).outcome,'HOLD');
});

// Read-only primary-source retrieval and independent evidence ledger remain separate
// from authority-bearing candidate promotion. All I/O is local and isolated.
test('ELM-001 connects allowlisted source retrieval to routed research without upgrading retrieval to truth',async()=>{
 const {PrimarySourceResearchProvider}=await import('../dist/epistemic/primarySourceResearch.js');
 const source='https://ec.europa.eu/elm-001';
 let calls=0;
 const provider=new PrimarySourceResearchProvider([source],async (_url,opts)=>{
   calls++;assert.equal(opts.redirect,'error');
   return new Response('Untrusted source content, not a validated claim',{headers:{'content-type':'text/plain'}});
 });
 const routed=new ResearchProviderRegistry({jevProviderId:'primary',externalProviderIds:[]}).register({id:'primary',provider,external:false,modelVersion:'primary-source-readonly-v1'});
 const finding=await new RoutedResearchProvider(routed,'LOCAL_JEV').research(request(0));
 assert.equal(calls,1);
 assert.equal(finding.supporting_evidence.length,0);
 assert.equal(finding.disconfirming_evidence.length,0);
 assert.equal(finding.requires_human_input,true);
 assert.match(finding.provenance_refs[0],/ec.europa.eu/);
 assert.equal('authority' in finding,false);
});

test('ELM-001 learning evidence ledger rejects echo and retains independently sourced candidates without promotion',async()=>{
 const {mkdtemp}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {LearningEvidenceStore}=await import('../dist/cognitive/learningEvidenceStore.js');
 const store=new LearningEvidenceStore(await mkdtemp(join(tmpdir(),'nyxa-elm-001-')));
 await store.init();
 const contribution=(id,role,source,modelId)=>({id,role,origin:'AI',claims:[{tag:'EXTERNAL_EVIDENCE',statement:'synthetic finding',source}],modelId,promptHash:`prompt-${id}`,parentIds:[]});
 const roles=['EXPLORE','CHALLENGE','INDEPENDENT_ALTERNATIVE'];
 for(const [id,unique] of [['echo',false],['independent',true]]){
   await store.append({candidateId:id,contributions:roles.map((r,i)=>contribution(`${id}-${i}`,r,unique?`source-${i}`:'source-0',`model-${i}`))},{writtenBy:'elm-test',taskId:'elm-001',runId:`elm-${id}`});
 }
 const echo=await store.assessCandidate('echo');
 const independent=await store.assessCandidate('independent');
 assert.equal(echo.eligible,false);
 assert.equal(independent.eligible,true);
 assert.equal(independent.authorityEffect,'NONE');
});
