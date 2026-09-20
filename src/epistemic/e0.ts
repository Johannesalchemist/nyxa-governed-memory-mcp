import type { E0ClaimInput, E0Result, E0Thresholds } from "./e0Types.js";
import { DEFAULT_E0_THRESHOLDS } from "./e0Types.js";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Pure, synchronous, deterministic fast-path triage (Phase 11A.2/11A.3). No LLM call, no
 * network call, no filesystem I/O, no external research -- FAST PATH BY DEFAULT. Given the
 * same input and thresholds it always returns the same result, so it is trivially testable and
 * has effectively zero overhead relative to normal MCP request handling (measured in
 * tests/e0-epistemic.test.mjs's performance case).
 *
 * Never claims to identify an actual unknown unknown: UNKNOWN_UNKNOWN_SIGNAL means only
 * "evidence exists that the current model/assumption space may be incomplete" -- contradiction,
 * anomaly, unexpected verification failure, or material disagreement between independent
 * sources. E0 does not and cannot know what it does not know; it can only notice signals that
 * its own model might be wrong.
 */
export function e0Triage(input: E0ClaimInput, thresholds: E0Thresholds = DEFAULT_E0_THRESHOLDS): E0Result {
  const evidenceStrength = clamp01(input.evidence_strength);
  const provenanceQuality = clamp01(input.provenance_quality);
  const impactScore = clamp01(input.impact_score);
  const contradictionScore = clamp01(input.contradiction_score ?? 0);
  const anomalyScore = clamp01(input.anomaly_score ?? 0);
  const disagreementScore = clamp01(input.disagreement_score ?? 0);
  const independentSources = Math.max(0, input.independent_sources ?? 0);
  const unresolvedHypotheses = Math.max(0, input.unresolved_hypotheses ?? 0);
  const requiredConfidence = clamp01(input.required_confidence ?? thresholds.requiredConfidence);

  const reasons: string[] = [];
  const missingEvidence: string[] = [];
  const contradictions: string[] = [];

  // E0's primary question is answerability / epistemic sufficiency:
  // can this claim/question/decision be justified to the required confidence using what is
  // available NOW? Anomaly detection is only one possible input to that decision.
  const evidenceMissing = input.evidence_missing === true;
  const evidenceUnavailable = input.evidence_unavailable === true;
  const evidenceStale = input.evidence_stale === true;
  const stateUnobservable = input.current_state_observable === false;
  const unverifiableClaim = input.unverifiable_claim === true;
  const weakProvenance = provenanceQuality < thresholds.provenanceWeak;
  const insufficientEvidence = evidenceStrength < requiredConfidence;
  const unresolvedCompetingHypotheses = unresolvedHypotheses >= 2;

  if (evidenceMissing) {
    reasons.push("missing_evidence");
    missingEvidence.push("required_supporting_evidence");
  }
  if (evidenceUnavailable) {
    reasons.push("unavailable_evidence");
    missingEvidence.push("currently_unavailable_evidence");
  }
  if (evidenceStale) {
    reasons.push("stale_evidence");
    missingEvidence.push("fresh_evidence");
  }
  if (stateUnobservable) {
    reasons.push("unobservable_current_state");
    missingEvidence.push("current_state_observation");
  }
  if (unverifiableClaim) {
    reasons.push("unverifiable_claim");
    missingEvidence.push("verification_path");
  }
  if (weakProvenance) {
    reasons.push("weak_or_missing_provenance");
    missingEvidence.push("provenance_chain");
  }
  if (insufficientEvidence) reasons.push("confidence_below_required_threshold");
  if (unresolvedCompetingHypotheses) reasons.push("unresolved_competing_hypotheses");

  const claimExceedsEvidence =
    input.claimed_confidence !== undefined &&
    clamp01(input.claimed_confidence) > evidenceStrength + thresholds.claimEvidenceEpsilon;
  if (claimExceedsEvidence) reasons.push("claim_exceeds_evidence");

  const contradictory = contradictionScore >= thresholds.contradiction;
  if (contradictory) {
    reasons.push("conflicting_evidence");
    contradictions.push("contradiction_score_above_threshold");
  }

  const materialDisagreement = independentSources >= 2 && disagreementScore >= thresholds.disagreement;
  if (materialDisagreement) {
    reasons.push("independent_sources_disagree");
    contradictions.push("material_disagreement_between_independent_sources");
  }

  const anomalous = anomalyScore >= thresholds.anomaly;
  if (anomalous) reasons.push("anomalous_observation");
  const unexplainedResidual = input.unexplained_residual === true;
  if (unexplainedResidual) reasons.push("unexplained_residual");
  const unexpectedFailure = input.verification_failed_unexpectedly === true;
  if (unexpectedFailure) reasons.push("unexpected_verification_failure");

  const highImpactWeakEvidence = impactScore >= thresholds.impact && evidenceStrength < thresholds.evidenceFloor;
  if (highImpactWeakEvidence) {
    reasons.push("high_impact_weak_evidence");
    missingEvidence.push("stronger_supporting_evidence_for_high_impact_claim");
  }

  // UNKNOWN_UNKNOWN_SIGNAL is narrow: positive evidence that the current model/assumption
  // space may be incomplete, not merely ordinary missing evidence.
  const modelIncompleteSignal = anomalous || unexplainedResidual || unexpectedFailure;
  const currentlyUnanswerable =
    evidenceMissing || evidenceUnavailable || stateUnobservable || unverifiableClaim ||
    evidenceStrength < thresholds.evidenceFloor;
  const boundedButInsufficient =
    evidenceStale || weakProvenance || insufficientEvidence || claimExceedsEvidence ||
    contradictory || materialDisagreement || unresolvedCompetingHypotheses || highImpactWeakEvidence;

  let classification: E0Result["classification"];
  if (modelIncompleteSignal) classification = "UNKNOWN_UNKNOWN_SIGNAL";
  else if (currentlyUnanswerable) classification = "UNKNOWN";
  else if (boundedButInsufficient) classification = "KNOWN_UNKNOWN";
  else classification = "KNOWN";

  const triggerDepthDrill =
    classification === "UNKNOWN_UNKNOWN_SIGNAL" ||
    contradictory || materialDisagreement ||
    (impactScore >= thresholds.impact && classification !== "KNOWN") ||
    (weakProvenance && impactScore >= thresholds.impact);

  const availabilityPenalty =
    (evidenceMissing ? 0.35 : 0) +
    (evidenceUnavailable ? 0.25 : 0) +
    (evidenceStale ? 0.15 : 0) +
    (stateUnobservable ? 0.25 : 0) +
    (unverifiableClaim ? 0.25 : 0) +
    (unresolvedCompetingHypotheses ? 0.15 : 0);
  const residualUncertainty = clamp01(
    (1 - evidenceStrength) * 0.4 + contradictionScore * 0.15 + disagreementScore * 0.1 +
    anomalyScore * 0.2 + availabilityPenalty
  );

  return {
    classification,
    evidence_strength: evidenceStrength,
    contradiction_score: contradictionScore,
    anomaly_score: anomalyScore,
    provenance_quality: provenanceQuality,
    impact_score: impactScore,
    trigger_depth_drill: triggerDepthDrill,
    reasons: [...new Set(reasons)],
    missing_evidence: [...new Set(missingEvidence)],
    contradictions: [...new Set(contradictions)],
    alternative_hypotheses: [],
    provenance_refs: input.provenance_refs ?? [],
    residual_uncertainty: residualUncertainty
  };
}

/**
 * Phase 11A.7 -- EPISTEMIC_HOLD. NOT a capability decision, NOT an authority grant, NOT
 * something E0 enforces by itself: this function only ever returns a boolean recommendation.
 * Human authority and epistemic sufficiency are deliberately kept as separate dimensions --
 * nothing here reads or is read by governance/humanGrant.ts, so a human grant cannot silently
 * erase this recommendation (there is no shared state for it to erase; see
 * tests/e0-epistemic.test.mjs case L for the independence proof).
 */
export function recommendEpistemicHold(result: E0Result, thresholds: E0Thresholds = DEFAULT_E0_THRESHOLDS): boolean {
  const consequential = result.impact_score >= thresholds.impact;
  const unresolved = result.classification === "UNKNOWN" || result.classification === "UNKNOWN_UNKNOWN_SIGNAL";
  return consequential && unresolved && result.residual_uncertainty >= thresholds.epistemicHoldResidualUncertainty;
}
