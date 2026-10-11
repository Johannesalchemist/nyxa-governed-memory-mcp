import type { MandateRecord } from "../governance/mandateStore.js";
import type { VerificationDecision } from "./unifiedTrustFabric.js";

/** Identity evidence and delegated authority are distinct. A trust tier cannot override a mandate. */
export type AgentTrustTier = "observed" | "verified" | "delegated";
export type AgentPassportAuthorityRequest = Readonly<{
  actor: string;
  action: string;
  scope: string;
  target: string;
  nowMs: number;
}>;
export type AgentPassportAuthorityDecision = Readonly<{
  allowed: boolean;
  trustTier: AgentTrustTier;
  reason: string;
  mandateId?: string;
}>;

/** Mandates must originate from an authenticated issuer and a verified ledger. */
export function evaluateAgentPassportAuthority(
  identity: VerificationDecision,
  mandate: (MandateRecord & { active: boolean; revoked: boolean }) | undefined,
  request: AgentPassportAuthorityRequest
): AgentPassportAuthorityDecision {
  const deny = (reason: string, trustTier: AgentTrustTier): AgentPassportAuthorityDecision => ({ allowed: false, trustTier, reason });
  if (!identity.verified || identity.subjectId !== request.actor) return deny("agent_identity_not_verified", "observed");
  if (!Number.isSafeInteger(request.nowMs) || request.nowMs < 0) return deny("invalid_clock", "verified");
  if (!mandate || !mandate.active || mandate.revoked) return deny("active_mandate_required", "verified");
  if (mandate.actor !== request.actor || mandate.action !== request.action) return deny("mandate_actor_or_action_mismatch", "verified");
  if (mandate.scopePrefix && !request.scope.startsWith(mandate.scopePrefix)) return deny("mandate_scope_mismatch", "verified");
  if (mandate.targetPrefix && !request.target.startsWith(mandate.targetPrefix)) return deny("mandate_target_mismatch", "verified");
  const issuedAt = Date.parse(mandate.issuedAt);
  const expiresAt = Date.parse(mandate.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || request.nowMs < issuedAt || request.nowMs >= expiresAt) return deny("mandate_expired_or_not_yet_valid", "verified");
  if (!mandate.issuedBy.authorityPrincipalId || !mandate.issuedBy.authorityMethod) return deny("mandate_issuer_missing", "verified");
  return { allowed: true, trustTier: "delegated", reason: "identity_and_mandate_valid", mandateId: mandate.mandateId };
}
