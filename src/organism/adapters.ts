import type { E0Result } from "../epistemic/e0Types.js";
import type { ScenarioArtifact } from "../model-space/scenario.js";
import type { KernelEffectEnvelope } from "../governance/kernelContract.js";
import type { KernelEffectReceipt } from "../governance/effectReceipt.js";
import { verifyKernelEffectReceipt } from "../governance/effectReceipt.js";
import { buildOrganismSignal, type OrganismSignalEnvelope } from "./signalEnvelope.js";

export function signalFromE0(subject:string,result:E0Result,parentSignalIds:readonly string[]=[]):OrganismSignalEnvelope {
  const kind=result.trigger_depth_drill ? "QUESTION" : "INTERPRETATION";
  const truthState=result.classification==="KNOWN" ? "INFERRED" : "UNKNOWN";
  return buildOrganismSignal({kind,producer:"e0",truthState,subject,payload:result,provenanceRefs:result.provenance_refs,parentSignalIds});
}
export function signalFromScenario(subject:string,scenario:ScenarioArtifact,parentSignalIds:readonly string[]=[]):OrganismSignalEnvelope {
  return buildOrganismSignal({kind:"SIMULATION_CANDIDATE",producer:"twin",truthState:"SIMULATED",subject,payload:scenario,provenanceRefs:scenario.evidence.map(e=>e.id),parentSignalIds});
}
export function signalFromEffectReceipt(subject:string,envelope:KernelEffectEnvelope,receipt:KernelEffectReceipt,parentSignalIds:readonly string[]=[]):OrganismSignalEnvelope {
  if(!verifyKernelEffectReceipt(envelope,receipt)) throw new Error("organism_unverified_effect_receipt");
  return buildOrganismSignal({kind:"EFFECT_RESULT",producer:"verification",truthState:"VERIFIED",subject,payload:receipt,provenanceRefs:[receipt.effectId,receipt.envelopeHash],parentSignalIds});
}
