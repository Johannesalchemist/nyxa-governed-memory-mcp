import test from 'node:test';import assert from 'node:assert/strict';
import {ingestRegulatoryDatum,verifyRegulatoryDatum,forPurpose} from '../dist/ccam/regulatoryIngest.js';
import {deriveRegulatoryFinding,learningCannotAuthorize} from '../dist/ccam/regulatoryTwin.js';
const datum=ingestRegulatoryDatum({id:'d1',sourceLaw:'StVG',sourceClause:'1g',systemId:'ads1',systemVersion:'1.0',timestamp:'2026-10-07T19:00:00Z',fields:{speed:30,softwareVersion:'1.0'},purposes:['CONTINUOUS_SUPERVISION','REGULATORY_LEARNING'],provenanceRefs:['vehicle:receipt:1']});
test('mandatory regulatory datum is integrity protected',()=>{assert.equal(verifyRegulatoryDatum(datum),true);assert.equal(verifyRegulatoryDatum({...datum,fields:{speed:99}}),false)});
test('purpose limitation is executable',()=>{assert.equal(forPurpose(datum,'CONTINUOUS_SUPERVISION').id,'d1');assert.throws(()=>forPurpose(datum,'TYPE_APPROVAL'),/purpose_denied/)});
test('regulatory learning keeps hypothesis and counterhypothesis',()=>{const f=deriveRegulatoryFinding([datum],{hypothesis:'rule change reduces intervention load',counterHypothesis:'rule change increases correlated failure risk',observedBoundary:'not-yet-established',recommendedExperiment:'held-out Munich scenario sweep',provenanceRefs:['analysis:1']});assert.match(f.id,/finding:/);assert.equal(f.counterHypothesis.length>0,true)});
test('regulatory learning cannot itself grant operational authority',()=>assert.equal(learningCannotAuthorize(),false));
