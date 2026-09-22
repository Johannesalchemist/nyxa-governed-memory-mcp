import type { SrmClaim } from "../srm/types.js";

export type CoCogitationRole =
  | "EXPLORE"
  | "CHALLENGE"
  | "INDEPENDENT_ALTERNATIVE";

export type CogitationOrigin = "HUMAN" | "AI";

export type EmergentEventKind =
  | "GLITCH"
  | "CO_DRIFT"
  | "KLITSCH";

export type EmergentEvent = {
  kind: EmergentEventKind;
  diagnosticAction: "DIAGNOSE" | "COUNTERCHECK" | "EXPLORE";
  learningStatus: "NOT_ELIGIBLE" | "HYPOTHESIS_ONLY";
  authorityEffect: "NONE";
  novelDimensionCandidate: boolean;
};

export type CoCogitationContribution = {
  id: string;
  role: CoCogitationRole;
  origin?: CogitationOrigin;
  claims: readonly SrmClaim[];
  modelId: string;
  promptHash: string;
  parentIds: readonly string[];
};

export type HumanAiDriftSignal = {
  agreementDelta: number;
  independentEvidenceDelta: number;
};

export type CoCogitationAssessment = {
  driftScore: number;
  humanAiDriftScore: number;
  independentLineages: number;
  sharedSourceRatio: number;
  epistemicResetRequired: boolean;
  learningEligible: boolean;
  reasons: string[];
};

export type LearningPromotionGate = {
  eligible: boolean;
  authorityEffect: "NONE";
  reason: "co_cogitation_pass" | "co_cogitation_hold";
  assessment: CoCogitationAssessment;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * GLITCH:
 * anomaly inside an existing model space -> diagnose.
 *
 * CO_DRIFT:
 * confidence/agreement grows faster than independent evidence -> countercheck.
 *
 * KLITSCH:
 * unexpected bridge between model spaces -> explore as a
 * NovelDimensionCandidate.
 *
 * A Klitsch is not evidence, validated learning or authority by itself.
 */
export function classifyEmergentEvent(
  kind: EmergentEventKind
): EmergentEvent {
  if (kind === "GLITCH") {
    return {
      kind,
      diagnosticAction: "DIAGNOSE",
      learningStatus: "NOT_ELIGIBLE",
      authorityEffect: "NONE",
      novelDimensionCandidate: false
    };
  }

  if (kind === "CO_DRIFT") {
    return {
      kind,
      diagnosticAction: "COUNTERCHECK",
      learningStatus: "NOT_ELIGIBLE",
      authorityEffect: "NONE",
      novelDimensionCandidate: false
    };
  }

  return {
    kind,
    diagnosticAction: "EXPLORE",
    learningStatus: "HYPOTHESIS_ONLY",
    authorityEffect: "NONE",
    novelDimensionCandidate: true
  };
}

/**
 * Human-AI co-drift signal.
 *
 * Agreement is not evidence. If agreement grows faster than new independent
 * evidence, the difference becomes a drift signal.
 *
 * This is deliberately bounded and does not make a truth claim.
 */
export function assessHumanAiDrift(
  signal?: HumanAiDriftSignal
): number {
  if (!signal) return 0;

  const agreement = clamp01(signal.agreementDelta);
  const evidence = clamp01(signal.independentEvidenceDelta);

  return clamp01(agreement - evidence);
}

/**
 * Deterministic anti-echo-chamber gate for recursive learning.
 *
 * Measures derivation quality, not truth and never authority.
 * Exploration, adversarial challenge and independent reconstruction
 * must remain distinguishable.
 */
export function assessCoCogitation(
  cs: readonly CoCogitationContribution[],
  humanAiSignal?: HumanAiDriftSignal
): CoCogitationAssessment {
  const humanAiDriftScore = assessHumanAiDrift(humanAiSignal);

  if (!cs.length) {
    return {
      driftScore: 1,
      humanAiDriftScore,
      independentLineages: 0,
      sharedSourceRatio: 1,
      epistemicResetRequired: true,
      learningEligible: false,
      reasons: ["no_contributions"]
    };
  }

  const roles = new Set(cs.map(c => c.role));

  const sources = cs.map(c =>
    new Set(
      c.claims
        .map(x => x.source.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  let pairs = 0;
  let overlaps = 0;

  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      pairs++;
      if ([...sources[i]!].some(x => sources[j]!.has(x))) {
        overlaps++;
      }
    }
  }

  const sharedSourceRatio = pairs ? overlaps / pairs : 0;

  const independentLineages = new Set(
    cs.map(
      c =>
        `${c.modelId}|${c.promptHash}|${[...c.parentIds]
          .sort()
          .join(",")}`
    )
  ).size;

  const lineageDuplication =
    1 - independentLineages / cs.length;

  const missingRoleRatio =
    1 - roles.size / 3;

  const structuralDriftScore = clamp01(
    sharedSourceRatio * 0.40 +
    lineageDuplication * 0.35 +
    missingRoleRatio * 0.25
  );

  const driftScore = Math.max(
    structuralDriftScore,
    humanAiDriftScore
  );

  const reasons: string[] = [];

  if (roles.size < 3)
    reasons.push("role_diversity_insufficient");

  if (independentLineages < 2)
    reasons.push("lineage_independence_insufficient");

  if (sharedSourceRatio > 0.75)
    reasons.push("source_overlap_high");

  if (driftScore >= 0.5)
    reasons.push("co_cogitation_drift_high");

  if (humanAiDriftScore >= 0.5)
    reasons.push("human_ai_co_drift_high");

  const epistemicResetRequired =
    driftScore >= 0.5 ||
    independentLineages < 2 ||
    sharedSourceRatio > 0.75;

  const learningEligible =
    !epistemicResetRequired &&
    roles.has("EXPLORE") &&
    roles.has("CHALLENGE") &&
    roles.has("INDEPENDENT_ALTERNATIVE");

  return {
    driftScore,
    humanAiDriftScore,
    independentLineages,
    sharedSourceRatio,
    epistemicResetRequired,
    learningEligible,
    reasons
  };
}

/**
 * Deterministic learning-promotion eligibility gate.
 *
 * This gate evaluates epistemic diversity only. It may HOLD learning,
 * but it can never grant authority. Human/governance authorization
 * remains an independent prerequisite at the effect boundary.
 */
export function assessLearningPromotionEligibility(
  cs: readonly CoCogitationContribution[],
  humanAiSignal?: HumanAiDriftSignal
): LearningPromotionGate {
  const assessment = assessCoCogitation(cs, humanAiSignal);

  return {
    eligible: assessment.learningEligible,
    authorityEffect: "NONE",
    reason: assessment.learningEligible
      ? "co_cogitation_pass"
      : "co_cogitation_hold",
    assessment
  };
}

/**
 * Epistemic reset:
 * discard derived conclusions and reconstruct from primary evidence.
 */
export function primaryEvidenceForReset(
  cs: readonly CoCogitationContribution[]
): SrmClaim[] {
  const seen = new Set<string>();

  return cs
    .flatMap(c => c.claims)
    .filter(
      x =>
        x.tag === "FACT" ||
        x.tag === "EXTERNAL_EVIDENCE"
    )
    .filter(x => {
      const key =
        `${x.tag}|${x.statement.trim()}|` +
        `${x.source.trim()}|${x.asOf ?? ""}`;

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}
