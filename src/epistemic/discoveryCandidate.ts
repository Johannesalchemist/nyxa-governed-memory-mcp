import { createHash } from "node:crypto";
import { ProposalSchema, type ValidatedProposal } from "../governance/proposal.js";
import type { E0Result } from "./e0Types.js";
import type { StoreCandidateInput } from "../schema/candidates.js";
import type { SrmClaim } from "../srm/types.js";

/** Inert proposal payload only. Persistence MUST pass through the existing Gamma-gated
 * nyxa_memory_store_candidate action; never write CandidateStore from E0 HOLD. */
export function discoveryQuestionId(action: string, target: string, claims: readonly SrmClaim[] = []): string {
  const semanticClaims = claims.map(c => [c.tag, c.statement.trim().replace(/\s+/g, " ").toLowerCase()]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify([action, target, semanticClaims])).digest("hex");
}

export function discoveryCandidateFromE0(
  claimId: string,
  statement: string,
  result: E0Result
): StoreCandidateInput | undefined {
  if (!result.trigger_depth_drill && result.classification === "KNOWN") return undefined;
  const content = JSON.stringify({
    kind: "e0_discovery_v1",
    claim_id: claimId.slice(0, 200),
    statement: statement.slice(0, 1600),
    classification: result.classification,
    residual_uncertainty: result.residual_uncertainty,
    reasons: result.reasons.slice(0, 8).map(v => v.slice(0, 120)),
    hypotheses: result.alternative_hypotheses.slice(0, 6).map(v => v.slice(0, 120))
  });
  return {
    content,
    candidate_type: "open_question",
    source: "system",
    scope: "project",
    purpose: "E0 unresolved uncertainty; requires governed research and independent evidence before promotion",
    confidence: Math.max(0, Math.min(1, 1 - result.residual_uncertainty)),
    importance: Math.max(0, Math.min(1, result.impact_score))
  };
}

/** Recall matching is deliberately advisory: a previous candidate is NOT evidence
 * and cannot lift E0 HOLD. The same unresolved question is not proposed twice. */
export function findExistingDiscoveryCandidate(
  claimId: string,
  candidates: readonly import('../schema/candidates.js').MemoryCandidate[]
): import('../schema/candidates.js').MemoryCandidate | undefined {
  return candidates.find(candidate => {
    if (candidate.candidate_type !== 'open_question' || candidate.scope !== 'project' || candidate.status !== 'pending') return false;
    try {
      const value: unknown = JSON.parse(candidate.content);
      return typeof value === 'object' && value !== null &&
        'kind' in value && value.kind === 'e0_discovery_v1' &&
        'claim_id' in value && value.claim_id === claimId;
    } catch { return false; }
  });
}

/** A complete, schema-validated *proposal*, never an authorization or effect.
 * Requesting identity and provenance come from the original validated proposal. */
export function buildDiscoveryStoreProposal(original: ValidatedProposal, payload: StoreCandidateInput): ValidatedProposal {
  return ProposalSchema.parse({
    actor: original.actor,
    action: "nyxa_memory_store_candidate",
    target: "memory:/candidate",
    scope: original.scope,
    claims: [{ tag: "FACT", statement: "E0 generated a pending research-question proposal; its underlying claim remains unverified", source: "nyxa:e0:runtime-observation" }],
    uncertainty: 0.1,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: original.provenance,
    rationale: "Persist an unverified open question as a pending project candidate, subject to independent Gamma/E0 checks.",
    opposition: "A pending candidate is not evidence, and this proposal does not imply approval.",
    payload
  });
}
