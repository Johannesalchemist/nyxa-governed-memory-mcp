import test from "node:test"; import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const p=new URL("../src/compliance/controlLibrary.ts",import.meta.url);
test("control library is framework-attributed and evidence-linked",async()=>{const s=await readFile(p,"utf8"); for(const x of ["EU_AI_ACT","NIST_AI_RMF","ISO_IEC_42001","ALLOW/DENY/ESCALATE","effect_radius","source"]) assert.ok(s.includes(x));});
test("library does not claim certification",async()=>{const s=(await readFile(p,"utf8")).toLowerCase(); assert.equal(s.includes("certified"),false);});
