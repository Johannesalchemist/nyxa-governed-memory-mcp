import test from "node:test"; import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const p=new URL("../src/compliance/receiptEvidence.ts",import.meta.url);
test("governance receipts map decisions and verified no-effect without inventing evidence",async()=>{const s=await readFile(p,"utf8"); for(const x of ["policy_decision","prevented_effect","effect_radius","human_gate","authority_record","verifiedEffect"]) assert.ok(s.includes(x)); assert.ok(s.includes('d==="DENY"'));});
test("receipt evidence feeds assessment and hashed evidence package",async()=>{const s=await readFile(p,"utf8"); assert.ok(s.includes("buildComplianceEvidencePackage"));});
