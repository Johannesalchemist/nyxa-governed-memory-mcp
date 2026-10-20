import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLawExamSourceRelevance as assess} from '../dist/science/lawExamSourceRelevanceV1.js';
const norm = {sourceId:'gg-art5',role:'NORM',use:'DIRECT',normRefs:['GG ART. 5 ABS. 1'],issueTags:['expression']};
const medical = {sourceId:'bverfg-1bvl1-24',role:'JUDGMENT',use:'ANALOGY',normRefs:[],issueTags:['forced-medical-treatment']};
const exam = sources => assess({requiredNormRefs:['GG Art. 5 Abs. 1'],questionIssueTags:['expression'],sources});
test('medical judgment cannot replace speech norm',()=>assert.equal(exam([medical]).reason,'required_direct_norm_missing'));
test('medical judgment mislabelled direct is rejected',()=>assert.equal(exam([{...medical,use:'DIRECT'}]).reason,'direct_source_issue_mismatch'));
test('background source cannot satisfy direct norm',()=>assert.equal(exam([{...norm,use:'BACKGROUND'}]).reason,'required_direct_norm_missing'));
test('duplicate source IDs rejected',()=>assert.equal(exam([norm,norm]).reason,'duplicate_source_id'));
test('relevant sources never prove content or graduation',()=>{
 const r=exam([norm,medical]);assert.equal(r.decision,'RELEVANCE_CANDIDATE');
 assert.equal(r.sourceContentVerified,false);assert.equal(r.independentExamPassed,false);assert.equal(r.graduated,false);
});
test('empty question scope fails closed',()=>assert.equal(assess({requiredNormRefs:[],questionIssueTags:[],sources:[norm]}).decision,'HOLD'));
