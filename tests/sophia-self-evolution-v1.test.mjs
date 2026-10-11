import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSophiaImprovement} from '../dist/organism/sophiaSelfEvolutionV1.js';
const base={id:'gaze-1',domain:'gaze',tenantId:'t1',targetTenantId:'t1',baselineEvidence:'reference-1',candidateEvidence:'render-2',measurableGain:0.2,independentReview:'APPROVED',governanceDecision:'ALLOW',verifiedMandate:true,involvesPersonalData:false,consentVerified:false,requestsExternalEffect:false};
test('approved evidence is only a dispatch candidate, never authority',()=>{const r=evaluateSophiaImprovement(base);assert.equal(r.status,'CANDIDATE_FOR_GOVERNED_DISPATCH');assert.equal(r.authorityEffect,'NONE')});
test('review, gate, mandate, evidence and gain fail closed',()=>{for(const change of [{independentReview:'PENDING'},{governanceDecision:'DENY'},{verifiedMandate:false},{measurableGain:-1},{candidateEvidence:''},{targetTenantId:'other'},{involvesPersonalData:true}])assert.equal(evaluateSophiaImprovement({...base,...change}).status,'HOLD')});
