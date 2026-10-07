import type { EvolutionLoopResult } from "./evolutionLoop.js";
import { evaluateLearningRatchet } from "./learningRatchet.js";

type LearningRatchetDecision = ReturnType<typeof evaluateLearningRatchet>;

export type RatchetedEvolutionDecision = {
  decision: "PROMOTE_MODEL_UPDATE" | "HOLD" | "SHADOW_ONLY";
  nextGenerationCandidate: number | null;
  authorityEffect: "NONE";
  reasons: readonly string[];
};

export function gateRatchetedEvolution(
  evolution: EvolutionLoopResult,
  ratchet: LearningRatchetDecision
): RatchetedEvolutionDecision {
  const reasons = [...evolution.reasons, ...ratchet.reasons];

  if (evolution.authorityEffect !== "NONE" || ratchet.authorityEffect !== "NONE") {
    return {
      decision: "HOLD",
      nextGenerationCandidate: null,
      authorityEffect: "NONE",
      reasons: [...reasons, "authority_effect_rejected"]
    };
  }

  if (evolution.decision === "SHADOW_ONLY") {
    return {
      decision: "SHADOW_ONLY",
      nextGenerationCandidate: null,
      authorityEffect: "NONE",
      reasons
    };
  }

  const generationValid = Number.isInteger(evolution.nextGenerationCandidate) && (evolution.nextGenerationCandidate ?? -1) >= 0;
  if (evolution.decision === "PROMOTE_MODEL_UPDATE" && !generationValid) {
    return { decision: "HOLD", nextGenerationCandidate: null, authorityEffect: "NONE", reasons: [...reasons, "next_generation_candidate_missing"] };
  }

  const promote =
    evolution.decision === "PROMOTE_MODEL_UPDATE" &&
    ratchet.outcome === "RETAIN_CANDIDATE";

  return {
    decision: promote ? "PROMOTE_MODEL_UPDATE" : "HOLD",
    nextGenerationCandidate: promote ? evolution.nextGenerationCandidate : null,
    authorityEffect: "NONE",
    reasons: promote ? reasons : [...reasons, "learning_ratchet_hold"]
  };
}
