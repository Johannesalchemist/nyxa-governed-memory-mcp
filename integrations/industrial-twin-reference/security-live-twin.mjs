import { createHash } from "node:crypto";

const SCHEMA = "nyxa.security-live-twin.v0";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function hashState(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function assertObservation(observation) {
  if (!observation || typeof observation !== "object") throw new TypeError("observation_required");
  if (!observation.twinId) throw new TypeError("twin_id_required");
  const observedAt = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedAt)) throw new TypeError("observed_at_invalid");
  return observedAt;
}

export function deriveAttackSurface(state) {
  const tools = Array.isArray(state.tools) ? state.tools : [];
  const mandates = Array.isArray(state.mandates) ? state.mandates : [];
  const boundaries = Array.isArray(state.trustBoundaries) ? state.trustBoundaries : [];
  return Object.freeze({
    exposedTools: tools.filter((tool) => tool?.exposed === true).map((tool) => tool.id).filter(Boolean),
    effectfulTools: tools.filter((tool) => ["I1", "I2", "I3"].includes(tool?.capabilityClass)).map((tool) => tool.id).filter(Boolean),
    unboundedMandates: mandates.filter((mandate) => mandate?.bounded !== true).map((mandate) => mandate.id).filter(Boolean),
    unknownTrustBoundaries: boundaries.filter((boundary) => !boundary?.status || boundary.status === "UNKNOWN").map((boundary) => boundary.id).filter(Boolean),
    failClosed: state.failClosed !== false
  });
}

export function buildSecurityLiveTwin(observation, previous = null) {
  const observedAt = assertObservation(observation);
  if (previous) {
    const previousAt = Date.parse(previous.observedAt);
    if (Number.isFinite(previousAt) && observedAt <= previousAt) throw new Error("stale_observation");
    if (previous.twinId && previous.twinId !== observation.twinId) throw new Error("twin_identity_mismatch");
  }

  const state = {
    schema: SCHEMA,
    twinId: observation.twinId,
    observedAt: new Date(observedAt).toISOString(),
    assets: observation.assets ?? [],
    agents: observation.agents ?? [],
    tools: observation.tools ?? [],
    identities: observation.identities ?? [],
    mandates: observation.mandates ?? [],
    trustBoundaries: observation.trustBoundaries ?? [],
    targets: observation.targets ?? [],
    effects: observation.effects ?? [],
    failClosed: observation.failClosed !== false
  };
  const attackSurface = deriveAttackSurface(state);
  return Object.freeze({ ...state, attackSurface, stateHash: hashState({ ...state, attackSurface }) });
}

export const SECURITY_LIVE_TWIN_SCHEMA = SCHEMA;
