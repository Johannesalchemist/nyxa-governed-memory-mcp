import test from "node:test";
import assert from "node:assert/strict";
import { detectRecurringMeaningSpaces } from "../dist/epistemic/meaningSpace.js";
import { buildQuestionGraph } from "../dist/epistemic/questionGraph.js";
import { e0Triage } from "../dist/epistemic/e0.js";

test("recurring meanings are detected but remain perspective/provenance-bound",()=>{
 const xs=[
  {id:"a",perspective:"factory",text:"hidden dependency causes production delay",valence:-.8,relation_refs:["R1"],provenance_refs:["P1"]},
  {id:"b",perspective:"agent",text:"hidden dependency causes agent delay",valence:-.4,relation_refs:["R2"],provenance_refs:["P2"]},
  {id:"c",perspective:"film",text:"camera composition and lighting",valence:.2,relation_refs:["R3"],provenance_refs:["P3"]}
 ];
 const spaces=detectRecurringMeaningSpaces(xs,.3); assert.equal(spaces.length,1); assert.deepEqual(spaces[0].member_ids,["a","b"]); assert.deepEqual(spaces[0].perspectives,["agent","factory"]); assert.deepEqual(spaces[0].provenance_refs,["P1","P2"]);
});

test("E0 residual opens questions without manufacturing answers",()=>{
 const result=e0Triage({claim_id:"C1",statement:"unexpected result",evidence_strength:.5,provenance_quality:.9,impact_score:.8,unexplained_residual:true,evidence_missing:true});
 const graph=buildQuestionGraph("C1",result); assert.equal(graph.open,true); assert.ok(graph.questions.some(q=>q.kind==="MODEL")); assert.ok(graph.questions.some(q=>q.kind==="EVIDENCE")); assert.equal("answer" in graph,false);
});

test("known claim yields no forced inquiry",()=>{
 const result=e0Triage({claim_id:"C2",statement:"bounded",evidence_strength:.95,provenance_quality:.95,impact_score:.2});
 const graph=buildQuestionGraph("C2",result); assert.equal(result.classification,"KNOWN"); assert.equal(graph.open,false); assert.equal(graph.questions.length,0);
});
