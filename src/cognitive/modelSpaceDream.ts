import type { StoreCandidateInput } from "../schema/candidates.js";
import type { ScenarioArtifact, ScenarioComparison } from "../model-space/scenario.js";

export function deriveModelSpaceDreamCandidate(
  a: ScenarioArtifact,
  b: ScenarioArtifact,
  comparison: ScenarioComparison
): StoreCandidateInput {
  const strongest = [...comparison.deltas].sort((x, y) => Math.abs(y.relativeDelta ?? 0) - Math.abs(x.relativeDelta ?? 0))[0];
  const signal = strongest
    ? `${strongest.metric} changed by ${strongest.delta} (relative ${strongest.relativeDelta ?? "undefined"}).`
    : "No shared numeric metric changed.";

  return {
    content:
      `Model-space comparison ${a.id} -> ${b.id}. Changed parameters: ` +
      `${comparison.changedParameters.join(", ") || "none"}. Strongest observed signal: ${signal} ` +
      `This is a hypothesis-generating comparison, not a causal claim. Evidence refs: ` +
      `${comparison.evidenceRefs.join(", ") || "none"}. Compute energy represented: ${comparison.energyJoules} J.`,
    candidate_type: "dream_summary",
    source: "dream",
    scope: "project",
    purpose: "model-space relationship discovery from already-computed scenario artifacts",
    confidence: 0.4,
    importance: strongest ? 0.5 : 0.2
  };
}
