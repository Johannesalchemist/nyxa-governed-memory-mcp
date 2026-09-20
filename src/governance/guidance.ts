import type { ValidatedProposal } from "./proposal.js";
import type { ToolPolicy } from "../policy/toolPolicy.js";
import type { MandateRecord } from "./mandateStore.js";

export type Guidance = {
  status: "PROCEED" | "REQUEST_MANDATE" | "REDUCE_SCOPE" | "PREPARE_ONLY" | "CORRECT_PROPOSAL" | "STOP";
  nextAction: string;
  reason: string;
  allowedCorridor?: { actor: string; action: string; scopePrefix?: string; targetPrefix?: string; expiresAt?: string; maxExecutionsPerWindow?: number; maxEffectUnitsPerWindow?: number };
};

export function deriveGuidance(proposal: ValidatedProposal, policy: ToolPolicy | undefined, reason: string, mandates: readonly (MandateRecord & { active: boolean })[] = []): Guidance {
  if (reason === "irreversibility_underestimated") return { status: "CORRECT_PROPOSAL", nextAction: `Re-propose ${proposal.action} using the real capability class ${policy?.capabilityClass ?? "unknown"}; do not execute yet.`, reason };
  if (reason.includes("requires_mandate") || reason === "external_authority_required" || reason === "human_approval_required") return { status: "REQUEST_MANDATE", nextAction: `Request an explicit mandate for actor=${proposal.actor}, action=${proposal.action}, scope=${proposal.scope}, target=${proposal.target}.`, reason };
  const related = mandates.find((m) => m.active && m.actor === proposal.actor && m.action === proposal.action);
  if (related) return { status: "REDUCE_SCOPE", nextAction: "Keep the capability, but re-plan inside the existing mandate corridor or request a deliberate mandate expansion.", reason, allowedCorridor: { actor: related.actor, action: related.action, ...(related.scopePrefix ? { scopePrefix: related.scopePrefix } : {}), ...(related.targetPrefix ? { targetPrefix: related.targetPrefix } : {}), expiresAt: related.expiresAt, ...(related.maxExecutionsPerWindow ? { maxExecutionsPerWindow: related.maxExecutionsPerWindow } : {}), ...(related.maxEffectUnitsPerWindow ? { maxEffectUnitsPerWindow: related.maxEffectUnitsPerWindow } : {}) } };
  if (policy && policy.capabilityClass !== "I0") return { status: "PREPARE_ONLY", nextAction: "Perform reversible preparation and evidence gathering only; hold the real-world effect for authority.", reason };
  return { status: "STOP", nextAction: "Do not execute this proposal; correct the blocking condition first.", reason };
}

export type ReplanStep = { kind: "EXECUTE" | "PREPARE" | "REQUEST_AUTHORITY" | "CORRECT" | "STOP"; action: string; effectAllowed: boolean; description: string };
export type Replan = { mode: "BOUNDED_AUTONOMY"; originalAction: string; steps: ReplanStep[]; autoExecutable: boolean };

export function buildBoundedReplan(proposal: ValidatedProposal, guidance: Guidance): Replan {
  const steps: ReplanStep[] = [];
  if (guidance.status === "CORRECT_PROPOSAL") steps.push({ kind: "CORRECT", action: proposal.action, effectAllowed: false, description: guidance.nextAction });
  else if (guidance.status === "REQUEST_MANDATE") {
    steps.push({ kind: "PREPARE", action: proposal.action, effectAllowed: false, description: "Preserve the requested capability and prepare all reversible inputs/evidence without causing the external or authoritative effect." });
    steps.push({ kind: "REQUEST_AUTHORITY", action: proposal.action, effectAllowed: false, description: guidance.nextAction });
  } else if (guidance.status === "REDUCE_SCOPE") {
    steps.push({ kind: "PREPARE", action: proposal.action, effectAllowed: false, description: "Re-plan the action inside the returned allowed corridor; do not widen actor/action/scope/target or budget." });
    steps.push({ kind: "REQUEST_AUTHORITY", action: proposal.action, effectAllowed: false, description: "Request mandate expansion only if the original goal cannot be achieved inside that corridor." });
  } else if (guidance.status === "PREPARE_ONLY") steps.push({ kind: "PREPARE", action: proposal.action, effectAllowed: false, description: guidance.nextAction });
  else steps.push({ kind: "STOP", action: proposal.action, effectAllowed: false, description: guidance.nextAction });
  return { mode: "BOUNDED_AUTONOMY", originalAction: proposal.action, steps, autoExecutable: steps.some((s) => s.kind === "EXECUTE" && s.effectAllowed) };
}
