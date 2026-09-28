export type Framework = "EU_AI_ACT" | "NIST_AI_RMF" | "ISO_IEC_42001" | "ISO_IEC_23894" | "GDPR";
export type ControlStatus = "design" | "implemented" | "verified" | "not_applicable";
export type AssessmentStatus = "SATISFIED" | "PARTIAL" | "MISSING" | "NOT_APPLICABLE" | "E0";
export type Control = { id:string; framework:Framework; reference:string; requirement:string; nyxaControl:string; evidence:string[]; status:ControlStatus; source:string; sourceVersion:string };
const C=(id:string,framework:Framework,reference:string,requirement:string,nyxaControl:string,evidence:string[],status:ControlStatus,source:string,sourceVersion:string):Control=>({id,framework,reference,requirement,nyxaControl,evidence,status,source,sourceVersion});
export const CONTROL_LIBRARY: readonly Control[] = [
 C("EU-AIA-ART9-RISK","EU_AI_ACT","Article 9","Risk-management system for applicable high-risk AI","risk/effect classification + lifecycle review",["risk_record","effect_radius","revision_delta"],"design","Regulation (EU) 2024/1689","2024-07-12"),
 C("EU-AIA-ART12-LOGGING","EU_AI_ACT","Article 12","Applicable high-risk AI supports automatic event recording","audit chain + effect evidence",["audit_event","audit_chain","effect_receipt"],"implemented","Regulation (EU) 2024/1689","2024-07-12"),
 C("EU-AIA-ART14-HUMAN","EU_AI_ACT","Article 14","Applicable high-risk AI supports effective human oversight","human authority + escalation gate",["human_gate","authority_record","policy_decision"],"implemented","Regulation (EU) 2024/1689","2024-07-12"),
 C("EU-AIA-ART50-TRANSPARENCY","EU_AI_ACT","Article 50","Applicable AI-system transparency duties","provenance + explicit AI/effect disclosure",["audit_event","provenance_record"],"design","European Commission Article 50 guidelines","2026-07-20"),
 C("NIST-GOVERN-1.1","NIST_AI_RMF","GOVERN 1.1","Legal and regulatory requirements are understood, managed and documented","versioned control library + evidence mapping",["control_mapping","source_provenance"],"implemented","NIST AI RMF 1.0","2023-01-26"),
 C("NIST-MAP-3.5","NIST_AI_RMF","MAP 3.5","Human oversight processes are defined, assessed and documented","human authority + mandate evidence",["human_gate","authority_record"],"implemented","NIST AI RMF 1.0","2023-01-26"),
 C("NIST-MEASURE-1.1","NIST_AI_RMF","MEASURE 1.1","Risk measurements and non-measurable risks are documented","E0 + effect radius + uncertainty evidence",["e0_record","effect_radius","test_result"],"implemented","NIST AI RMF 1.0","2023-01-26"),
 C("NIST-MANAGE-1.3","NIST_AI_RMF","MANAGE 1.3","Responses to high-priority AI risks are developed and documented","ALLOW/DENY/ESCALATE + recovery evidence",["policy_decision","prevented_effect","recovery_record"],"implemented","NIST AI RMF 1.0","2023-01-26"),
 C("ISO42001-AIMS","ISO_IEC_42001","ISO/IEC 42001:2023","Establish, implement, maintain and continually improve an AIMS","versioned governance/evidence lifecycle",["audit_chain","revision_delta","control_mapping"],"design","ISO public overview","2023-12"),
 C("ISO23894-RISK","ISO_IEC_23894","ISO/IEC 23894:2023","Integrate AI-specific risk management into organizational activities","risk/effect lifecycle + treatment evidence",["risk_record","effect_radius","policy_decision","recovery_record"],"design","ISO public overview","2023-02"),
 C("GDPR-ART25","GDPR","Article 25","Data protection by design and by default where applicable","least privilege + scoped effects + provenance",["scope_decision","provenance_record","policy_decision"],"design","Regulation (EU) 2016/679","2016-04-27"),
 C("GDPR-ART35","GDPR","Article 35","DPIA for processing likely to result in high risk where applicable","risk/effect assessment + human review",["risk_record","effect_radius","human_gate"],"design","Regulation (EU) 2016/679","2016-04-27")
] as const;
export const controlsForEvidence=(kind:string):Control[]=>CONTROL_LIBRARY.filter(c=>c.evidence.includes(kind));
