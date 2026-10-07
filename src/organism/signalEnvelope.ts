import { createHash } from "node:crypto";
import { safeJsonStringify } from "../utils/safeJson.js";

export const ORGANISM_SIGNAL_KINDS = ["OBSERVATION","INTERPRETATION","QUESTION","SIMULATION_CANDIDATE","SECURITY_SIGNAL","EFFECT_RESULT"] as const;
export type OrganismSignalKind = (typeof ORGANISM_SIGNAL_KINDS)[number];
export type OrganismProducer = "sensor"|"jev"|"e0"|"hunter"|"twin"|"antlion"|"kernel"|"verification"|"agency"|"human";
export type OrganismTruthState = "OBSERVED"|"REPORTED"|"INFERRED"|"SIMULATED"|"PROPOSED"|"VERIFIED"|"CONTRADICTED"|"UNKNOWN";

export type OrganismSignalEnvelope = {
  version: "nyxa.organism.signal.v1";
  id: string;
  kind: OrganismSignalKind;
  producer: OrganismProducer;
  truthState: OrganismTruthState;
  authority: "none";
  subject: string;
  payloadHash: string;
  provenanceRefs: readonly string[];
  parentSignalIds: readonly string[];
};

function validateSignalSemantics(input: {kind:OrganismSignalKind;producer:OrganismProducer;truthState:OrganismTruthState;subject:string;provenanceRefs:readonly string[];parentSignalIds:readonly string[]}): void {
  if(!input.subject.trim() || input.subject.length>512) throw new Error("organism_invalid_subject");
  if(input.provenanceRefs.length>64 || input.parentSignalIds.length>32) throw new Error("organism_lineage_limit");
  if(input.producer==="hunter" || input.producer==="twin") {
    if(input.kind!=="SIMULATION_CANDIDATE" || input.truthState!=="SIMULATED") throw new Error("organism_simulation_truth_laundering");
  }
  if(input.kind==="EFFECT_RESULT") {
    if(input.producer!=="verification" || input.truthState!=="VERIFIED") throw new Error("organism_effect_result_requires_verification");
  }
  if(input.truthState==="VERIFIED" && !(input.kind==="EFFECT_RESULT" && input.producer==="verification")) throw new Error("organism_verified_state_restricted");
  if(input.kind==="QUESTION" && !["e0","jev","human"].includes(input.producer)) throw new Error("organism_question_producer_invalid");
}

export function buildOrganismSignal(input: Omit<OrganismSignalEnvelope,"version"|"id"|"authority"|"payloadHash"> & {payload:unknown}): OrganismSignalEnvelope {
  validateSignalSemantics(input);
  const payloadHash=createHash("sha256").update(safeJsonStringify(input.payload)).digest("hex");
  const material=safeJsonStringify({kind:input.kind,producer:input.producer,truthState:input.truthState,subject:input.subject,payloadHash,provenanceRefs:[...input.provenanceRefs].sort(),parentSignalIds:[...input.parentSignalIds].sort()});
  return {version:"nyxa.organism.signal.v1",id:`sig_${createHash("sha256").update(material).digest("hex").slice(0,32)}`,kind:input.kind,producer:input.producer,truthState:input.truthState,authority:"none",subject:input.subject,payloadHash,provenanceRefs:[...input.provenanceRefs],parentSignalIds:[...input.parentSignalIds]};
}

export function canBecomeEffectProposal(signal: OrganismSignalEnvelope): {allowed:boolean;reason:string} {
  if(signal.authority!=="none") return {allowed:false,reason:"signal_authority_must_be_none"};
  if(signal.kind==="SIMULATION_CANDIDATE") return {allowed:true,reason:"candidate_may_be_proposed_but_carries_no_authority"};
  if(signal.kind==="INTERPRETATION"||signal.kind==="SECURITY_SIGNAL") return {allowed:true,reason:"signal_may_inform_proposal_but_carries_no_authority"};
  return {allowed:false,reason:"signal_kind_not_proposal_input"};
}
