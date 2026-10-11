import test from 'node:test';
import assert from 'node:assert/strict';
import {planStudyCycle,LAW_SCHOOL_S1} from '../dist/epistemic/studyAdapter.js';
test('study agent selects next module without promoting evidence',()=>{const x=planStudyCycle(LAW_SCHOOL_S1,{completed:[],failed:[],unresolved:[]});assert.equal(x.module.id,'law-method');assert.equal(x.authorityEffect,'NONE');assert.equal(x.promotionAllowed,false);assert.equal(x.requiresReview,true);});
test('study agent advances and fails closed on exhaustion',()=>{const x=planStudyCycle(LAW_SCHOOL_S1,{completed:['law-method'],failed:[],unresolved:[]});assert.equal(x.module.id,'law-constitutional');assert.throws(()=>planStudyCycle(LAW_SCHOOL_S1,{completed:['law-method','law-constitutional'],failed:[],unresolved:[]}));});
