import { CONTROL_LIBRARY, type AssessmentStatus, type Control } from "./controlLibrary.js";
export type EvidenceRecord={kind:string; controlId?:string; verified?:boolean; timestamp?:string; source?:string};
export type Assessment={controlId:string; framework:string; status:AssessmentStatus; matchedEvidence:string[]; missingEvidence:string[]};
export function assessControl(control:Control, records:readonly EvidenceRecord[], notApplicable=false):Assessment {
 if(notApplicable) return {controlId:control.id,framework:control.framework,status:"NOT_APPLICABLE",matchedEvidence:[],missingEvidence:[]};
 const matched=control.evidence.filter(k=>records.some(r=>(!r.controlId||r.controlId===control.id)&&r.kind===k&&r.verified!==false));
 const missing=control.evidence.filter(k=>!matched.includes(k));
 const hasUnknown=records.some(r=>(!r.controlId||r.controlId===control.id)&&r.kind==="e0_record");
 const status:AssessmentStatus=hasUnknown?"E0":matched.length===0?"MISSING":missing.length?"PARTIAL":"SATISFIED";
 return {controlId:control.id,framework:control.framework,status,matchedEvidence:matched,missingEvidence:missing};
}
export const assessLibrary=(records:readonly EvidenceRecord[])=>CONTROL_LIBRARY.map(c=>assessControl(c,records));
export function crosswalkByNyxaControl(){ const m=new Map<string,string[]>(); for(const c of CONTROL_LIBRARY){const a=m.get(c.nyxaControl)??[]; a.push(c.id); m.set(c.nyxaControl,a);} return m; }
