/**
 * E0 -- lightweight epistemic control layer (Step 11A). Sits in front of expensive research and
 * before downstream governance decisions. E0 NEVER creates effects, NEVER grants authority, and
 * NEVER bypasses Gamma / capability gates / human authority (see governance/gamma.ts,
 * governance/humanGrant.ts) -- it only ever produces data for those layers to consume. Nothing
 * in this directory imports AuditLog, CandidateStore, HumanGrantStore, SecureConnector, or any
 * other mutating store -- that is a structural (not merely policy) guarantee, verified in
 * tests/e0-epistemic.test.mjs case K.
 *
 * "Sicherheit begrenzt Aktionen. Sie beendet nicht das Denken." -- E0 is the thinking-keeps-going
 * half of that sentence: it is free to investigate, question, and flag uncertainty; it is never
 * free to act.
 */

export const E0_CLASSIFICATIONS = ["KNOWN", "KNOWN_UNKNOWN", "UNKNOWN", "UNKNOWN_UNKNOWN_SIGNAL"] as const;
export type E0Classification = (typeof E0_CLASSIFICATIONS)[number];

/**
 * Input claim/observation packet E0 triages. Every score is a plain number in [0,1], supplied
 * by the caller (never invented by E0 itself) -- E0 is a deterministic function of these inputs,
 * not a source of new evidence on the fast path.
 */
export type E0ClaimInput = {
  claim_id: string;
  statement: string;
  /** How strong the supporting evidence actually is, independent of what anyone claims. */
  evidence_strength: number;
  /** Quality/reliability of the evidence's source chain. Low = weak or missing provenance. */
  provenance_quality: number;
  /** How consequential this claim is if wrong -- drives the impact-weighted checks. */
  impact_score: number;
  /** Pre-computed degree of contradiction against other known evidence, if available. */
  contradiction_score?: number;
  /** Pre-computed anomaly/unexpectedness of the underlying observation, if available. */
  anomaly_score?: number;
  /** True when required supporting evidence is missing, not merely weak. */
  evidence_missing?: boolean;
  /** True when relevant evidence is known to exist but is currently unavailable. */
  evidence_unavailable?: boolean;
  /** True when the available evidence is too old for the claim/decision at hand. */
  evidence_stale?: boolean;
  /** True when the present system state needed to answer the question is not observable. */
  current_state_observable?: boolean;
  /** True when the claim cannot presently be verified with the available observables/tools. */
  unverifiable_claim?: boolean;
  /** Number of materially competing hypotheses that remain unresolved. */
  unresolved_hypotheses?: number;
  /** Required confidence for this claim/decision, derived by trusted integration logic. */
  required_confidence?: number;
  /** What confidence level the PROPOSER is claiming -- checked against evidence_strength for
   *  the "Claim <= Evidence" violation (signal B). Optional: omitted means no claim to check. */
  claimed_confidence?: number;
  /** Count of independent evidence sources considered, if known. */
  independent_sources?: number;
  /** How much independent sources materially disagree, if measured. */
  disagreement_score?: number;
  /** True if a verification step failed in a way the expected failure model does NOT already
   *  account for (signal G) -- distinct from an ordinary, anticipated DENY/failure. */
  verification_failed_unexpectedly?: boolean;
  /** True if the observed outcome is inconsistent with the expected model in some way not
   *  already captured by anomaly_score (signal E). */
  unexplained_residual?: boolean;
  provenance_refs?: string[];
};

export type E0Thresholds = {
  /** Below this, provenance is treated as weak/missing (signal A). */
  provenanceWeak: number;
  /** At/above this, provenance is strong enough to support a KNOWN classification. */
  provenanceStrong: number;
  /** At/above this, contradiction is material enough to trigger depth drill (signal C). */
  contradiction: number;
  /** At/above this, anomaly is material enough to trigger depth drill (signal D). */
  anomaly: number;
  /** At/above this, a claim counts as "high impact" (signals F and epistemic hold). */
  impact: number;
  /** Below this, evidence is too weak to support KNOWN even with no other signal. */
  evidenceFloor: number;
  /** At/above this, evidence is strong enough (with strong provenance) to support KNOWN. */
  evidenceStrong: number;
  /** At/above this, independent-source disagreement is material (signal H). */
  disagreement: number;
  /** Default confidence required when no trusted integration-specific requirement is supplied. */
  requiredConfidence: number;
  /** Minimum epsilon by which a claimed confidence must exceed evidence_strength to count as
   *  a real "Claim <= Evidence" violation (signal B), avoiding float-noise false positives. */
  claimEvidenceEpsilon: number;
  /** Residual uncertainty at/above which a consequential unresolved claim should recommend
   *  EPISTEMIC_HOLD (Phase 11A.7). */
  epistemicHoldResidualUncertainty: number;
};

export const DEFAULT_E0_THRESHOLDS: E0Thresholds = {
  provenanceWeak: 0.4,
  provenanceStrong: 0.7,
  contradiction: 0.5,
  anomaly: 0.5,
  impact: 0.6,
  evidenceFloor: 0.4,
  evidenceStrong: 0.7,
  disagreement: 0.5,
  requiredConfidence: 0.7,
  claimEvidenceEpsilon: 0.05,
  epistemicHoldResidualUncertainty: 0.5
};

export type E0Result = {
  classification: E0Classification;
  evidence_strength: number;
  contradiction_score: number;
  anomaly_score: number;
  provenance_quality: number;
  impact_score: number;
  trigger_depth_drill: boolean;
  reasons: string[];
  missing_evidence: string[];
  contradictions: string[];
  alternative_hypotheses: string[];
  provenance_refs: string[];
  residual_uncertainty: number;
};
