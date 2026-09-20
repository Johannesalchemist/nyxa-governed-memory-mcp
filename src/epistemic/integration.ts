import { e0Triage, recommendEpistemicHold } from "./e0.js";
import type { E0ClaimInput, E0Result, E0Thresholds } from "./e0Types.js";
import { DEFAULT_E0_THRESHOLDS } from "./e0Types.js";
import type { SrmClaim, SrmTag } from "../srm/types.js";
import type { MemoryCandidate } from "../schema/candidates.js";

/**
 * Step 11B integration boundary: the ONLY place E0 (src/epistemic/*) is wired into the real
 * proposal path (server.ts's handleProposeAction). Deliberately NOT inside gamma.ts -- gamma
 * remains the authority/risk engine, E0 remains the epistemic engine, and only a structured
 * E0Result (never gamma's own inputs) crosses the boundary. Nothing here imports gamma.ts,
 * AuditLog, CandidateStore, or HumanGrantStore.
 */

// ---- Phase 11B.2: fast-path selection predicate ----

/** Minimal shape this module needs from ToolPolicy -- avoids importing policy/toolPolicy.ts's
 *  concrete type here, keeping this module's dependency surface small and its predicate easy
 *  to unit-test with plain object literals. */
export type EpistemicToolPolicyView = {
  capabilityClass: "I0" | "I1" | "I2" | "I3";
  executionRisk: "none" | "low" | "medium" | "high";
  writesAuthoritativeMemory: boolean;
  requiresHumanApproval: boolean;
};

/**
 * Deterministic, inspectable, testable -- no LLM decides whether E0 runs. Bypasses E0 entirely
 * for pure reads / non-consequential I0 operations (capabilityClass I0, executionRisk "none",
 * no authoritative write) -- exactly the shape every read-only tool in TOOL_POLICIES already
 * has (readPolicy()). An unknown tool (undefined policy) also bypasses: gamma's own C1 check
 * denies it before E0 would ever matter.
 */
export function requiresEpistemicAssessment(toolPolicy: EpistemicToolPolicyView | undefined): boolean {
  if (!toolPolicy) return false;
  const nonConsequentialRead =
    toolPolicy.capabilityClass === "I0" && toolPolicy.executionRisk === "none" && !toolPolicy.writesAuthoritativeMemory;
  return !nonConsequentialRead;
}

// ---- Phase 11B.6: claim input derivation (never trust caller self-report as evidence) ----

const SRM_TAG_EVIDENCE_WEIGHT: Record<SrmTag, number> = {
  FACT: 1.0,
  EXTERNAL_EVIDENCE: 0.9,
  MEMORY: 0.6,
  MODEL_OUTPUT: 0.4,
  CLAIM: 0.4,
  SIMULATION: 0.3,
  INFERENCE: 0.3,
  HYPOTHESIS: 0.15
};

const STALE_EVIDENCE_MS = 24 * 60 * 60 * 1000; // matches governance/gamma.ts's own C4 window
const UNAVAILABLE_SOURCE_MARKERS = new Set(["unknown", "n/a", "none", "unavailable", "not_available"]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function claimProvenanceScore(claim: SrmClaim, now: number): number {
  const source = claim.source.trim().toLowerCase();
  const genericSource = source.length === 0 || ["unknown", "n/a", "none", "test", "trust-me", "self"].includes(source);
  let score = genericSource ? 0.15 : 0.55;
  if (claim.tag === "EXTERNAL_EVIDENCE") {
    if (claim.asOf) {
      const age = now - Date.parse(claim.asOf);
      const fresh = Number.isFinite(age) && age >= 0 && age <= STALE_EVIDENCE_MS;
      score += fresh ? 0.35 : -0.1;
    }
  } else {
    score += 0.25;
  }
  return clamp01(score);
}

/**
 * Ground-truth impact, derived from the tool's OWN policy (server-side, not proposal-controlled)
 * -- exactly mirroring gamma's own C3 principle (ground truth over self-report). A proposal has
 * no field that can raise this on its own.
 */
export function deriveImpactFromToolPolicy(toolPolicy: EpistemicToolPolicyView | undefined): number {
  if (!toolPolicy) return 1;
  const riskWeight: Record<EpistemicToolPolicyView["executionRisk"], number> = { none: 0, low: 0.3, medium: 0.6, high: 0.9 };
  const authoritativeBonus = toolPolicy.writesAuthoritativeMemory ? 0.35 : 0;
  const humanApprovalBonus = toolPolicy.requiresHumanApproval ? 0.2 : 0;
  return clamp01(riskWeight[toolPolicy.executionRisk] + authoritativeBonus + humanApprovalBonus);
}

/**
 * Builds the E0ClaimInput E0 actually assesses. Every quantity that could be gamed by a caller
 * is deliberately NOT taken from a caller-supplied "evidence_strength"/"confidence" field --
 * there is no such field on ProposalSchema at all (see governance/proposal.ts). evidence_strength
 * and provenance_quality are computed purely from the structural SRM shape of proposal.claims
 * (tag distribution, source realism, EXTERNAL_EVIDENCE freshness) and impact_score purely from
 * the tool's own ground-truth policy. The one legitimate use of caller self-report is
 * claimed_confidence (from proposal.uncertainty) -- compared AGAINST the independently derived
 * evidence_strength (E0's signal B), never substituted for it. Known, honest limitation (same
 * one gamma's own C4 check already accepts): this checks claim STRUCTURE, not claim TRUTH -- a
 * caller can still tag a false statement "FACT" with a real-looking source. It cannot, however,
 * force a high evidence_strength merely by asserting one, which is the actual property Phase
 * 11B.6 requires (see tests/e0-integration.test.mjs case H).
 */
export function deriveE0ClaimInput(
  claims: readonly SrmClaim[],
  uncertainty: number,
  toolPolicy: EpistemicToolPolicyView | undefined,
  claimId: string,
  statement: string,
  now: number = Date.now()
): E0ClaimInput {
  const tagWeights = claims.map((c) => SRM_TAG_EVIDENCE_WEIGHT[c.tag] ?? 0.3);
  const evidenceStrength = tagWeights.reduce((sum, w) => sum + w, 0) / Math.max(1, tagWeights.length);
  const provenanceScores = claims.map((c) => claimProvenanceScore(c, now));
  const provenanceQuality = provenanceScores.reduce((sum, s) => sum + s, 0) / Math.max(1, provenanceScores.length);
  const normalizedSources = claims.map((c) => c.source.trim().toLowerCase());
  const distinctSources = new Set(normalizedSources).size;
  const evidenceUnavailable = claims.length > 0 && normalizedSources.every((source) => UNAVAILABLE_SOURCE_MARKERS.has(source));
  const evidenceStale = claims.some((claim) => {
    if (!claim.asOf) return false;
    const age = now - Date.parse(claim.asOf);
    return Number.isFinite(age) && age > STALE_EVIDENCE_MS;
  });
  const unresolvedHypotheses = claims.filter((claim) => claim.tag === "HYPOTHESIS").length;
  // Conservative deterministic contradiction/disagreement sensor.
  // Detects only explicit negation of the same normalized proposition.
  const normalizeStatement = (value: string): string =>
    value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/g, "");

  const claimPolarity = (value: string) => {
    let statement = normalizeStatement(value);
    let negative = false;

    if (statement.startsWith("not ")) {
      negative = true;
      statement = statement.slice(4).trim();
    } else {
      const copularNegation = /\b(is|are|was|were) not\b/;
      if (copularNegation.test(statement)) {
        negative = true;
        statement = statement.replace(copularNegation, "$1");
      }
    }

    return { proposition: statement, negative };
  };

  const normalizedClaims = claims.map((claim) => ({
    ...claimPolarity(claim.statement),
    source: claim.source.trim().toLowerCase()
  }));

  let contradictionScore = 0;
  let disagreementScore = 0;

  for (let i = 0; i < normalizedClaims.length; i += 1) {
    for (let j = i + 1; j < normalizedClaims.length; j += 1) {
      const a = normalizedClaims[i];
      const b = normalizedClaims[j];

      if (!a || !b) continue;

      if (
        a.proposition &&
        a.proposition === b.proposition &&
        a.negative !== b.negative
      ) {
        contradictionScore = 1;
        if (a.source && b.source && a.source !== b.source) {
          disagreementScore = 1;
        }
      }
    }
  }

  const impactScore = deriveImpactFromToolPolicy(toolPolicy);
  // Required confidence is trusted server-side policy, never a caller override. Consequential
  // actions demand stronger epistemic support than low-impact ones while staying on the same
  // deterministic fast path.
  const requiredConfidence = impactScore >= DEFAULT_E0_THRESHOLDS.impact ? 0.8 : DEFAULT_E0_THRESHOLDS.requiredConfidence;

  return {
    claim_id: claimId,
    statement,
    evidence_strength: clamp01(evidenceStrength),
    provenance_quality: clamp01(provenanceQuality),
    impact_score: impactScore,
    claimed_confidence: clamp01(1 - uncertainty),
    required_confidence: requiredConfidence,
    evidence_missing: claims.length === 0,
    evidence_unavailable: evidenceUnavailable,
    evidence_stale: evidenceStale,
    unresolved_hypotheses: unresolvedHypotheses,
    independent_sources: distinctSources,
    contradiction_score: contradictionScore,
    disagreement_score: disagreementScore,
    provenance_refs: claims.map((c) => c.source)
  };
}

// ---- Phase 11B.3/11B.5: epistemic hold decision ----

/**
 * True if this ALLOW-eligible proposal must be held before any effect runs. Two paths lead
 * here, both honest about the absence of a production research provider (Phase 11B.5):
 *  - trigger_depth_drill: E0 judged this needs independent research to responsibly resolve.
 *    No production provider exists (none is wired into this dispatch path at all -- see
 *    epistemic/researchAgent.ts's own doc comment), so this becomes an immediate hold rather
 *    than a blocking call, a faked resolution, or a silently downgraded uncertainty score.
 *  - recommendEpistemicHold: even without a hard trigger, a consequential claim with high
 *    residual uncertainty is held (Phase 11A.7, reused unmodified).
 */
export function shouldEpistemicHold(result: E0Result, thresholds: E0Thresholds = DEFAULT_E0_THRESHOLDS): boolean {
  if (result.trigger_depth_drill) return true;
  return recommendEpistemicHold(result, thresholds);
}

/** Trusted, read-only system facts available to E0 at the proposal boundary. These are
 * observations from server-owned state, never caller assertions and never authority. */
export type EpistemicTrustedContext = {
  target_candidate?: MemoryCandidate;
  target_candidate_observable?: boolean;
};

/** Enriches the deterministic fast-path packet with real current-state observability.
 * CandidateStore remains outside E0: server.ts performs the I0 lookup and passes inert data. */
export function applyTrustedEpistemicContext(input: E0ClaimInput, context?: EpistemicTrustedContext): E0ClaimInput {
  if (!context) return input;
  if (context.target_candidate_observable === false) {
    return { ...input, current_state_observable: false, unverifiable_claim: true };
  }
  if (context.target_candidate) {
    return {
      ...input,
      current_state_observable: true,
      provenance_refs: [...new Set([...(input.provenance_refs ?? []), `candidate:${context.target_candidate.id}:${context.target_candidate.status}`])]
    };
  }
  return input;
}

export type EpistemicAssessment =
  | { ran: false }
  | { ran: true; failed: false; result: E0Result; held: boolean }
  | { ran: true; failed: true; held: true };

/**
 * Phase 11B (K): never throws. Any internal E0 failure fails CLOSED (held: true) for a
 * consequential proposal -- it is deliberately impossible for an E0 bug to silently downgrade
 * to "no hold" and let a consequential, unassessed effect through. triageFn is injectable so
 * tests can prove this with a deliberately throwing implementation without needing to find a
 * real input that breaks e0Triage itself.
 */
export function assessEpistemicStateSafely(
  claimId: string,
  statement: string,
  claims: readonly SrmClaim[],
  uncertainty: number,
  toolPolicy: EpistemicToolPolicyView | undefined,
  thresholds: E0Thresholds = DEFAULT_E0_THRESHOLDS,
  triageFn: (input: E0ClaimInput, t?: E0Thresholds) => E0Result = e0Triage,
  trustedContext?: EpistemicTrustedContext
): EpistemicAssessment {
  if (!requiresEpistemicAssessment(toolPolicy)) {
    return { ran: false };
  }
  try {
    const baseInput = deriveE0ClaimInput(claims, uncertainty, toolPolicy, claimId, statement);
    const input = applyTrustedEpistemicContext(baseInput, trustedContext);
    const result = triageFn(input, thresholds);
    return { ran: true, failed: false, result, held: shouldEpistemicHold(result, thresholds) };
  } catch {
    return { ran: true, failed: true, held: true };
  }
}
