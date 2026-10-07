import type { OrganismSignalEnvelope } from "./signalEnvelope.js";
export type OrganismRoute="OBSERVE"|"E0_TRIAGE"|"DISCOVERY"|"SECURITY_CONTAINMENT_REVIEW"|"EFFECT_VERIFICATION_FEEDBACK";
export type OrganismReflex={route:OrganismRoute;mayCreateEffect:false;priority:"normal"|"high";reasons:readonly string[]};
/** Deterministic routing only. Routing is never authority and never ALLOW. */
export function routeOrganismSignal(s:OrganismSignalEnvelope):OrganismReflex {
 if(s.authority!=="none") return {route:"SECURITY_CONTAINMENT_REVIEW",mayCreateEffect:false,priority:"high",reasons:["signal_carried_authority"]};
 if(s.kind==="SECURITY_SIGNAL") return {route:"SECURITY_CONTAINMENT_REVIEW",mayCreateEffect:false,priority:"high",reasons:["security_signal_requires_review"]};
 if(s.kind==="QUESTION"||s.kind==="SIMULATION_CANDIDATE") return {route:"DISCOVERY",mayCreateEffect:false,priority:"normal",reasons:["discovery_input"]};
 if(s.kind==="EFFECT_RESULT") return {route:"EFFECT_VERIFICATION_FEEDBACK",mayCreateEffect:false,priority:"normal",reasons:["verified_effect_feedback"]};
 if(s.kind==="OBSERVATION") return {route:"E0_TRIAGE",mayCreateEffect:false,priority:"normal",reasons:["observation_requires_epistemic_triage"]};
 return {route:"OBSERVE",mayCreateEffect:false,priority:"normal",reasons:["inert_interpretation"]};
}
