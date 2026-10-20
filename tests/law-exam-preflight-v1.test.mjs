import test from 'node:test';import assert from 'node:assert/strict';
import {preflightLawExam} from '../dist/science/lawExamPreflightV1.js';
test('missing sources hold',()=>assert.equal(preflightLawExam({requiredNormRefs:['GG Art. 5 Abs. 1'],questionIssueTags:['expression'],sources:[]}).decision,'HOLD'));
test('unregistered source hold',()=>assert.equal(preflightLawExam({requiredNormRefs:['GG Art. 5 Abs. 1'],questionIssueTags:['expression'],sources:[{sourceId:'fabricated',url:'https://example.org',sourceRef:'fake',use:'DIRECT'}]}).decision,'HOLD'));
test('no exam readiness inferred from metadata',()=>assert.equal(preflightLawExam({requiredNormRefs:['GG Art. 5 Abs. 1'],questionIssueTags:['expression'],sources:[]}).examReady,false));
