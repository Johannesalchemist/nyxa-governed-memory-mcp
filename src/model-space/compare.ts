import type { ScenarioArtifact, ScenarioComparison } from "./scenario.js";

export function compareScenarios(a: ScenarioArtifact, b: ScenarioArtifact): ScenarioComparison {
  const keys = new Set([...Object.keys(a.parameters), ...Object.keys(b.parameters)]);
  const sharedParameters: string[] = [];
  const changedParameters: string[] = [];
  for (const key of [...keys].sort()) {
    if (a.parameters[key] === b.parameters[key]) sharedParameters.push(key);
    else changedParameters.push(key);
  }

  const metricKeys = [...new Set([...Object.keys(a.metrics), ...Object.keys(b.metrics)])].sort();
  const deltas = metricKeys
    .filter((key) => a.metrics[key] !== undefined && b.metrics[key] !== undefined)
    .map((metric) => {
      const av = a.metrics[metric]!;
      const bv = b.metrics[metric]!;
      return { metric, a: av, b: bv, delta: bv - av, relativeDelta: av === 0 ? null : (bv - av) / av };
    });

  return {
    scenarioA: a.id, scenarioB: b.id, sharedParameters, changedParameters, deltas,
    evidenceRefs: [...new Set([...a.evidence, ...b.evidence].map((e) => e.id))].sort(),
    energyJoules: (a.energyJoules ?? 0) + (b.energyJoules ?? 0)
  };
}
