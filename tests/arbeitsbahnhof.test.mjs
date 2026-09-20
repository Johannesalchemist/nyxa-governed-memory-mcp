import test from "node:test";
import assert from "node:assert/strict";
import {evaluateTest,hash} from "../dist/arbeitsbahnhof/testGate.js";
const now=Date.now();
const p={actor:"arbeitsbahnhof-test",action:"arbeitsbahnhof.task.enqueue",target:"nixa-01:arbeitsbahnhof/test",
 expected_target:"nixa-01",scope:"synthetic test",uncertainty:0,requestedCapabilityClass:"I1",estimatedIrreversibility:"I1",
 claims:[{tag:"EXTERNAL_EVIDENCE",statement:"Jo approved bounded internal test",source:"user approval",asOf:new Date(now).toISOString()}],
 provenance:{taskId:"task-test",runId:"run-test",requestingIdentity:"Jo"},payload:{project:"arbeitsbahnhof-synthetic-test"}};
const c0={outcome:"PASS",reason:"target_match",localServerId:"nixa-01",expectedTarget:"nixa-01"};
const grant={id:"g-test",run_id:"run-test",actor:p.actor,approved_by:"Jo",project:p.payload.project,issued_at:new Date(now-100).toISOString(),
 expires_at:new Date(now+60000).toISOString(),entries:[{action:p.action,target:p.target,payload_hash:hash(p.payload),nonce:"nonce1234"}]};
const check=(proposal=p,g=grant,c=c0)=>evaluateTest(proposal,g,"nonce1234",now,c).decision.outcome;
test("approved bounded I1 operation uses existing gamma",()=>assert.equal(check(),"ALLOW"));
test("global existing write remains denied",()=>assert.equal(check({...p,action:"nyxa_apply_patch"}),"DENY"));
test("unknown action stays UNKNOWN",()=>assert.equal(check({...p,action:"publish_everything"}),"UNKNOWN"));
test("wrong host",()=>assert.equal(check(p,grant,{...c0,outcome:"DENY"}),"DENY"));
test("missing verified identity",()=>assert.equal(check(p,grant,{...c0,reason:"target_not_specified"}),"DENY"));
test("expired grant",()=>assert.equal(check(p,{...grant,expires_at:new Date(now-1).toISOString()}),"DENY"));
test("altered payload",()=>assert.equal(check({...p,payload:{...p.payload,extra:true}}),"DENY"));
test("wrong target",()=>assert.equal(check({...p,target:"factory-01:crm/test"}),"DENY"));
test("wrong actor",()=>assert.equal(check({...p,actor:"untrusted"}),"DENY"));
test("wrong run",()=>assert.equal(check({...p,provenance:{...p.provenance,runId:"other"}}),"DENY"));
test("false human identity",()=>assert.equal(check(p,{...grant,approved_by:"agent"}),"DENY"));
test("non synthetic data",()=>assert.equal(check({...p,payload:{project:"real"}}),"DENY"));
test("stale evidence remains denied by gamma",()=>assert.equal(check({...p,claims:[{...p.claims[0],asOf:new Date(now-90000000).toISOString()}]}),"DENY"));
test("I2 remains denied by true tool policies",()=>assert.equal(check({...p,action:"nyxa_self_model_write_identity"}),"DENY"));

test("read-tool name cannot carry a test write",()=>assert.equal(check({...p,action:"system.status"}),"DENY"));
