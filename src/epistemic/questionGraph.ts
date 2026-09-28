import { createHash } from "node:crypto";
import type { E0Result } from "./e0Types.js";

export type InquiryQuestion = { id:string; kind:"EVIDENCE"|"CONTRADICTION"|"OBSERVABILITY"|"ALTERNATIVE"|"MODEL"; text:string; reason:string };
export type QuestionGraph = { claim_id:string; questions:InquiryQuestion[]; open:boolean };
function qid(claim:string, kind:string, reason:string):string { return `q-${createHash("sha256").update(`${claim}|${kind}|${reason}`).digest("hex").slice(0,16)}`; }
/** Questions are scaffolding, never answers. This pure function creates no evidence and no effects. */
export function buildQuestionGraph(claimId:string, result:E0Result):QuestionGraph {
  const questions:InquiryQuestion[]=[]; const add=(kind:InquiryQuestion["kind"],text:string,reason:string)=>questions.push({id:qid(claimId,kind,reason),kind,text,reason});
  for (const missing of result.missing_evidence) add("EVIDENCE",`What observable evidence would resolve: ${missing}?`,missing);
  for (const contradiction of result.contradictions) add("CONTRADICTION",`Which assumptions or hidden dependencies could explain: ${contradiction}?`,contradiction);
  if (result.reasons.includes("unobservable_current_state")) add("OBSERVABILITY","What sensor, source, or observation would make the current state observable?","unobservable_current_state");
  if (result.alternative_hypotheses.length) add("ALTERNATIVE","Which observation would discriminate among the competing hypotheses?","competing_hypotheses");
  if (result.classification === "UNKNOWN_UNKNOWN_SIGNAL") add("MODEL","What relevant relationship or operator is absent from the current model?","model_may_be_incomplete");
  return {claim_id:claimId,questions,open:result.classification!=="KNOWN"};
}
