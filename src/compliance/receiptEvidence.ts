import { type EvidenceRecord } from "./assessment.js";
import { buildComplianceEvidencePackage } from "./evidencePackage.js";

export type GovernanceReceipt = Record<string, unknown>;
const decision = (r: GovernanceReceipt) => String(r.policy_decision ?? r.decision ?? "").toUpperCase();
export function evidenceFromReceipt(r: GovernanceReceipt): EvidenceRecord[] {
  const out: EvidenceRecord[] = []; const d=decision(r); const ref=String(r.effectId ?? r.effect_id ?? r.id ?? "receipt");
  if(d) out.push({kind:"policy_decision",source:ref,verified:true});
  if(r.effect_radius !== undefined || r.effectRadius !== undefined) out.push({kind:"effect_radius",source:ref,verified:true});
  if(r.human_gate || r.humanGate || d==="ESCALATE") out.push({kind:"human_gate",source:ref,verified:true});
  if(r.authority_record || r.authorityRecord || r.mandate_id) out.push({kind:"authority_record",source:ref,verified:true});
  const effect=String(r.verifiedEffect ?? r.verified_effect ?? "").toLowerCase();
  if((d==="DENY"||d==="DENIED") && ["absent->absent","effect=0","0"].includes(effect)) out.push({kind:"prevented_effect",source:ref,verified:true});
  if(r.audit_hash || r.auditHash) out.push({kind:"audit_chain",source:ref,verified:true});
  if(r.revision_delta || r.revisionDelta) out.push({kind:"revision_delta",source:ref,verified:true});
  return out;
}
export function packageFromReceipts(receipts: GovernanceReceipt[], generatedAt=new Date().toISOString()) {
 const evidence=receipts.flatMap(evidenceFromReceipt); return buildComplianceEvidencePackage(evidence,generatedAt);
}
