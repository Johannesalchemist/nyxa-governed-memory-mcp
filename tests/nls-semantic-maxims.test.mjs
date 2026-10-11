import test from 'node:test';import assert from 'node:assert/strict';
import {deriveSemanticMaxims} from '../dist/semantic/linguaSemantica.js';
const o=(meaning,sourceRef,independent=true)=>({domain:'budget',term:'  Attestation ',meaning,context:'e0',sourceRef,independent});
test('NLS independent evidence creates testable maxim without authority',()=>{const [m]=deriveSemanticMaxims([o('missing means unknown','a'),o('missing means unknown','b')]);assert.equal(m.status,'TESTABLE');assert.equal(m.authorityEffect,'NONE');assert.equal(m.supportingRefs.length,2)});
test('NLS contradictions prevent testable status and remain visible',()=>{const [m]=deriveSemanticMaxims([o('missing means unknown','a'),o('missing means unknown','b'),o('missing means zero','c')]);assert.equal(m.status,'HYPOTHESIS');assert.deepEqual(m.counterexampleRefs,['c'])});
test('NLS duplicate provenance is not independent corroboration',()=>{const [m]=deriveSemanticMaxims([o('x','same'),o('x','same')]);assert.equal(m.status,'HYPOTHESIS')});
test('NLS stable normalization and input order',()=>{const a=[o('x','a'),o('x','b')];assert.deepEqual(deriveSemanticMaxims(a),deriveSemanticMaxims([...a].reverse()))});
