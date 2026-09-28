import { createHash } from "node:crypto";
import { assessLibrary, type EvidenceRecord } from "./assessment.js";
export function buildComplianceEvidencePackage(records:readonly EvidenceRecord[], generatedAt=new Date().toISOString()) {
 const assessments=assessLibrary(records);
 const body={schema:"nyxa.compliance.evidence.v1",generatedAt,claimsBoundary:"Evidence mapping is not certification or legal advice.",records:[...records],assessments};
 const sha256=createHash("sha256").update(JSON.stringify(body)).digest("hex");
 return {...body,sha256};
}
