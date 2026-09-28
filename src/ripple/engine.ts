import { createHash } from "node:crypto";
import type { CausalEdge, ClaimDecision, ClaimRevision, ClaimStatus } from "./types.js";

const TERMINAL_NEGATIVE = new Set<ClaimStatus>(["CONTRADICTED", "RETRACTED", "UNVERIFIABLE"]);
const POSITIVE_RANK: Partial<Record<ClaimStatus, number>> = {
  UNKNOWN: 0,
  REPORTED: 1,
  SUPPORTED: 2,
  CORROBORATED: 3,
  VERIFIED: 4
};

export function deterministicRevisionId(revision: ClaimRevision): string {
  const canonical = JSON.stringify({
    claim_id: revision.claim_id,
    status: revision.status,
    valid_from: revision.valid_from,
    recorded_at: revision.recorded_at,
    provenance_ref: revision.provenance_ref,
    supersedes: revision.supersedes ?? null
  });
  return `ripple-${createHash("sha256").update(canonical).digest("hex").slice(0, 24)}`;
}

function millis(value: string): number {
  const n = Date.parse(value);
  if (!Number.isFinite(n)) throw new Error(`invalid timestamp: ${value}`);
  return n;
}

/** Immutable history in, effective state out. Later recorded corrections win for the same validity point. */
export function effectiveClaimRevision(history: readonly ClaimRevision[], asOf: string): ClaimRevision | undefined {
  const cutoff = millis(asOf);
  return history
    .filter((r) => millis(r.valid_from) <= cutoff && millis(r.recorded_at) <= cutoff)
    .slice()
    .sort((a, b) => millis(a.valid_from) - millis(b.valid_from) || millis(a.recorded_at) - millis(b.recorded_at))
    .at(-1);
}

/**
 * Epistemic gate for using a claim as an input to consequential downstream reasoning/effects.
 * Reach, repetition, authority and simulation count are deliberately absent: none can promote truth.
 */
export function gateClaim(history: readonly ClaimRevision[], asOf: string, required: ClaimStatus = "SUPPORTED"): ClaimDecision {
  const revision = effectiveClaimRevision(history, asOf);
  if (!revision) return { decision: "DENY", effective_status: "UNKNOWN", reasons: ["no_valid_evidence_state"] };
  if (TERMINAL_NEGATIVE.has(revision.status)) {
    return { decision: "DENY", effective_status: revision.status, reasons: ["terminal_negative_epistemic_state"], revision };
  }
  if (revision.status === "CONTESTED") {
    return { decision: "ESCALATE", effective_status: revision.status, reasons: ["materially_contested_claim"], revision };
  }
  const actual = POSITIVE_RANK[revision.status] ?? -1;
  const threshold = POSITIVE_RANK[required];
  if (threshold === undefined) throw new Error(`required status is not a promotable positive state: ${required}`);
  if (actual < threshold) {
    return { decision: "ESCALATE", effective_status: revision.status, reasons: ["evidence_below_required_status"], revision };
  }
  return { decision: "ALLOW", effective_status: revision.status, reasons: ["epistemic_requirement_satisfied"], revision };
}

/** Causal propagation is permitted only over explicitly causal evidence, never correlation or hypothesis alone. */
export function gateCausalEdge(edge: CausalEdge): ClaimDecision {
  if (edge.status === "CAUSAL_EVIDENCE") {
    return { decision: "ALLOW", effective_status: "VERIFIED", reasons: ["causal_evidence_present"] };
  }
  if (edge.status === "CAUSAL_SUPPORT") {
    return { decision: "ESCALATE", effective_status: "SUPPORTED", reasons: ["causal_support_not_causal_evidence"] };
  }
  return { decision: "DENY", effective_status: "UNKNOWN", reasons: ["correlation_or_hypothesis_cannot_drive_causal_effect"] };
}
