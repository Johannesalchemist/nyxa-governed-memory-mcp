const BACKENDS = new Set(["local", "hunter", "hammerhai"]);
const FORBIDDEN_EFFECTS = new Set(["external_write", "real_world_write", "network_effect"]);

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name}_invalid`);
  return value;
}

export function createAntLionExperiment({
  experimentId,
  scenario,
  backend = "local",
  seeds = 1,
  populations = 1,
  requestedEffects = [],
  realWorldAuthority = false
}) {
  if (!experimentId) throw new TypeError("experiment_id_required");
  if (!scenario) throw new TypeError("scenario_required");
  if (!BACKENDS.has(backend)) throw new TypeError("backend_invalid");
  if (realWorldAuthority !== false) throw new Error("real_world_authority_forbidden");

  const effects = Array.isArray(requestedEffects) ? requestedEffects : [];
  const forbidden = effects.filter((effect) => FORBIDDEN_EFFECTS.has(effect));
  if (forbidden.length) throw new Error(`simulation_effect_forbidden:${forbidden.join(",")}`);

  return Object.freeze({
    schema: "nyxa.antlion.experiment.v0",
    experimentId,
    scenario,
    backend,
    seeds: positiveInteger(seeds, "seeds"),
    populations: positiveInteger(populations, "populations"),
    requestedEffects: effects,
    containment: Object.freeze({
      realWorldAuthority: false,
      externalWrites: "DENY",
      networkEffects: "DENY",
      authorityEffect: "NONE"
    })
  });
}

export function validateAntLionResult(experiment, result) {
  if (!experiment || experiment?.containment?.realWorldAuthority !== false) {
    throw new Error("experiment_containment_invalid");
  }
  if (!result || typeof result !== "object") throw new TypeError("simulation_result_required");
  if (result.realWorldAuthority === true) throw new Error("simulation_claims_real_world_authority");
  if (result.authorityEffect && result.authorityEffect !== "NONE") {
    throw new Error("simulation_authority_effect_forbidden");
  }

  return Object.freeze({
    schema: "nyxa.antlion.evidence.v0",
    experimentId: experiment.experimentId,
    backend: experiment.backend,
    authorityEffect: "NONE",
    evidenceType: "SIMULATION_ONLY",
    result
  });
}

export const ANTLION_BACKENDS = Object.freeze([...BACKENDS]);
