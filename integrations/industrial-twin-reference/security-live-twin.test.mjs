import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSecurityLiveTwin } from "./security-live-twin.mjs";
import { createAntLionExperiment, validateAntLionResult } from "./antlion-infrastructure.mjs";

test("security live twin hashes state and derives attack surface", () => {
  const twin = buildSecurityLiveTwin({
    twinId: "factory-01",
    observedAt: "2026-10-05T22:00:00Z",
    tools: [
      { id: "camera.read", exposed: true, capabilityClass: "I0" },
      { id: "robot.move", exposed: true, capabilityClass: "I2" }
    ],
    mandates: [{ id: "legacy", bounded: false }],
    trustBoundaries: [{ id: "vendor-link", status: "UNKNOWN" }]
  });
  assert.match(twin.stateHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(twin.attackSurface.exposedTools, ["camera.read", "robot.move"]);
  assert.deepEqual(twin.attackSurface.effectfulTools, ["robot.move"]);
  assert.deepEqual(twin.attackSurface.unboundedMandates, ["legacy"]);
  assert.deepEqual(twin.attackSurface.unknownTrustBoundaries, ["vendor-link"]);
  assert.equal(twin.attackSurface.failClosed, true);
});

test("security live twin rejects stale observations", () => {
  const first = buildSecurityLiveTwin({ twinId: "factory-01", observedAt: "2026-10-05T22:00:00Z" });
  assert.throws(
    () => buildSecurityLiveTwin({ twinId: "factory-01", observedAt: "2026-10-05T21:59:59Z" }, first),
    /stale_observation/
  );
});

test("hunter experiment supports large simulation without authority", () => {
  const experiment = createAntLionExperiment({
    experimentId: "hunter-sweep-001",
    scenario: "cascading-agent-compromise",
    backend: "hunter",
    seeds: 50000,
    populations: 128
  });
  assert.equal(experiment.backend, "hunter");
  assert.equal(experiment.seeds, 50000);
  assert.equal(experiment.populations, 128);
  assert.equal(experiment.containment.realWorldAuthority, false);
  assert.equal(experiment.containment.authorityEffect, "NONE");
});

test("simulation result is evidence only and never authority", () => {
  const experiment = createAntLionExperiment({
    experimentId: "local-001",
    scenario: "tool-injection",
    backend: "local"
  });
  const evidence = validateAntLionResult(experiment, { compromisedAgents: 7, authorityEffect: "NONE" });
  assert.equal(evidence.evidenceType, "SIMULATION_ONLY");
  assert.equal(evidence.authorityEffect, "NONE");
  assert.throws(
    () => validateAntLionResult(experiment, { realWorldAuthority: true }),
    /simulation_claims_real_world_authority/
  );
  assert.throws(
    () => createAntLionExperiment({
      experimentId: "bad",
      scenario: "escape",
      requestedEffects: ["external_write"]
    }),
    /simulation_effect_forbidden/
  );
});
