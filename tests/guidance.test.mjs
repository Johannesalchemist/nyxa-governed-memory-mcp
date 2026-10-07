import test from "node:test";
import assert from "node:assert/strict";
import { deriveGuidance, buildBoundedReplan } from "../dist/governance/guidance.js";
const p={actor:"buyer",action:"purchase",target:"payment:shop/300",scope:"travel",claims:[{tag:"FACT",statement:"x",source:"t"}],uncertainty:0,requestedCapabilityClass:"I2",estimatedIrreversibility:"I2",provenance:{taskId:"t",runId:"r",requestingIdentity:"Jo"}};
const policy={toolName:"purchase",minimumMode:"draft",writesAuthoritativeMemory:false,requiresHumanApproval:false,executionRisk:"medium",allowedInV01:true,capabilityClass:"I2"};
test("missing mandate guides toward authority instead of capability removal",()=>assert.equal(deriveGuidance(p,policy,"capability_class_I2_requires_mandate").status,"REQUEST_MANDATE"));
test("nearby mandate exposes the allowed corridor",()=>{const g=deriveGuidance(p,policy,"target_rate_exceeded",[{mandateId:"m",actor:"buyer",action:"purchase",scopePrefix:"travel",targetPrefix:"payment:shop/",issuedAt:"x",expiresAt:"2099-01-01T00:00:00.000Z",issuedBy:{authorityPrincipalId:"human:jo",authorityMethod:"operator-token"},active:true}]);assert.equal(g.status,"REDUCE_SCOPE");assert.equal(g.allowedCorridor.targetPrefix,"payment:shop/");});
test("underclaim is corrected, never silently widened",()=>assert.equal(deriveGuidance({...p,estimatedIrreversibility:"I0"},policy,"irreversibility_underestimated").status,"CORRECT_PROPOSAL"));

test("blocked I2 becomes prepare + authority request, never hidden execution",()=>{const g=deriveGuidance(p,policy,"capability_class_I2_requires_mandate");const r=buildBoundedReplan(p,g);assert.deepEqual(r.steps.map(x=>x.kind),["PREPARE","REQUEST_AUTHORITY"]);assert.equal(r.autoExecutable,false);assert.ok(r.steps.every(x=>x.effectAllowed===false));});
test("scope mismatch replans inward before asking for expansion",()=>{const g={status:"REDUCE_SCOPE",nextAction:"inside corridor",reason:"scope",allowedCorridor:{actor:"buyer",action:"purchase",scopePrefix:"travel/eu"}};const r=buildBoundedReplan(p,g);assert.equal(r.steps[0].kind,"PREPARE");assert.equal(r.steps[1].kind,"REQUEST_AUTHORITY");});
