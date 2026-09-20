import test from "node:test";
import assert from "node:assert/strict";
import { compareScenarios } from "../dist/model-space/compare.js";
import { deriveModelSpaceDreamCandidate } from "../dist/cognitive/modelSpaceDream.js";

test("model space compares computed scenarios and emits bounded dream candidate", () => {
  const common = { modelVersion: "urban-heat-v1", createdAt: "2026-09-19T00:00:00Z" };
  const a = { ...common, id: "HN-BASE", title: "Heilbronn baseline", parameters: { trees: 100, traffic: 1 }, metrics: { heatC: 34, exposure: 100 }, evidence: [{ id: "scan-1", kind: "measurement", provenance: "synthetic-test-fixture", confidence: 0.8 }], energyJoules: 1200 };
  const b = { ...common, id: "HN-TREES", title: "Heilbronn tree intervention", parameters: { trees: 150, traffic: 1 }, metrics: { heatC: 32, exposure: 82 }, evidence: [{ id: "sim-2", kind: "simulation", provenance: "synthetic-test-fixture", confidence: 0.7 }], energyJoules: 1400 };

  const comparison = compareScenarios(a, b);
  assert.deepEqual(comparison.changedParameters, ["trees"]);
  assert.equal(comparison.energyJoules, 2600);
  assert.equal(comparison.deltas.find((x) => x.metric === "heatC").delta, -2);

  const candidate = deriveModelSpaceDreamCandidate(a, b, comparison);
  assert.equal(candidate.candidate_type, "dream_summary");
  assert.equal(candidate.source, "dream");
  assert.match(candidate.content, /not a causal claim/i);
  assert.match(candidate.content, /2600 J/);
});
