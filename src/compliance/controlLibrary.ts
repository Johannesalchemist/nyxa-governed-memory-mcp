export type ControlStatus = "design" | "implemented" | "verified" | "not_applicable";
export type Control = {
  id: string; framework: "EU_AI_ACT" | "NIST_AI_RMF" | "ISO_IEC_42001";
  reference: string; requirement: string; nyxaControl: string;
  evidence: string[]; status: ControlStatus; source: string;
};

export const CONTROL_LIBRARY: readonly Control[] = [
  { id:"EU-AIA-ART50-TRANSPARENCY", framework:"EU_AI_ACT", reference:"Article 50", requirement:"Applicable AI-system transparency duties", nyxaControl:"provenance + explicit AI/effect disclosure", evidence:["audit_event","provenance_record"], status:"design", source:"European Commission Article 50 guidelines, 2026-07-20" },
  { id:"EU-AIA-HR-RISK", framework:"EU_AI_ACT", reference:"High-risk requirements", requirement:"Risk-managed lifecycle for applicable high-risk systems", nyxaControl:"risk/effect classification + human escalation", evidence:["policy_decision","effect_radius","human_gate"], status:"design", source:"European Commission high-risk guidelines" },
  { id:"NIST-GOVERN-1.1", framework:"NIST_AI_RMF", reference:"GOVERN 1.1", requirement:"Legal and regulatory requirements are understood, managed and documented", nyxaControl:"versioned control library + evidence mapping", evidence:["control_mapping","source_provenance"], status:"implemented", source:"NIST AI RMF Playbook" },
  { id:"NIST-MEASURE-1.1", framework:"NIST_AI_RMF", reference:"MEASURE 1.1", requirement:"Select and document risk measurements including what cannot be measured", nyxaControl:"E0 + effect radius + uncertainty evidence", evidence:["e0_record","effect_radius","test_result"], status:"implemented", source:"NIST AI RMF Playbook" },
  { id:"NIST-MANAGE-1.3", framework:"NIST_AI_RMF", reference:"MANAGE 1.3", requirement:"Develop, plan and document responses to high-priority AI risks", nyxaControl:"ALLOW/DENY/ESCALATE + recovery evidence", evidence:["policy_decision","prevented_effect","recovery_record"], status:"implemented", source:"NIST AI RMF Playbook" },
  { id:"ISO42001-AIMS", framework:"ISO_IEC_42001", reference:"ISO/IEC 42001:2023", requirement:"Establish, implement, maintain and continually improve an AI management system", nyxaControl:"versioned governance/evidence lifecycle", evidence:["audit_chain","revision_delta","control_mapping"], status:"design", source:"ISO/IEC 42001:2023 public overview" }
] as const;

export function controlsForEvidence(kind: string): Control[] { return CONTROL_LIBRARY.filter(c => c.evidence.includes(kind)); }
