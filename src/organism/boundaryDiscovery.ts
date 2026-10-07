export type DesignDimensionKind = "VARIABLE" | "RELATION" | "OBJECTIVE" | "BOUNDARY";

export type AssumptionDimension = {
  id: string;
  kind: DesignDimensionKind;
  description: string;
};

export type VariationEvent = {
  dimensionId: string;
  generation: number;
  evidenceRefs: readonly string[];
};

export type BoundaryCandidate = {
  dimension: AssumptionDimension;
  reason: "NEVER_VARIED";
  observedGenerations: readonly number[];
  evidenceRefs: readonly string[];
};

export type BoundaryDiscoveryResult = {
  version: "nyxa.boundary-discovery.v1";
  candidates: readonly BoundaryCandidate[];
  authorityEffect: "NONE";
  capabilityEffect: "NONE";
  effectRadiusDelta: 0;
};

/**
 * E0_B is deliberately inert: it identifies explicit assumptions that have
 * never been varied. It cannot mutate the design space or grant authority.
 */
export function discoverUnvariedBoundaries(input: {
  assumptions: readonly AssumptionDimension[];
  history: readonly VariationEvent[];
}): BoundaryDiscoveryResult {
  const ids = new Set<string>();
  for (const assumption of input.assumptions) {
    if (!assumption.id.trim() || !assumption.description.trim()) {
      throw new Error("boundary_discovery_invalid_assumption");
    }
    if (ids.has(assumption.id)) throw new Error("boundary_discovery_duplicate_assumption");
    ids.add(assumption.id);
  }

  const historyByDimension = new Map<string, VariationEvent[]>();
  for (const event of input.history) {
    if (!ids.has(event.dimensionId)) throw new Error("boundary_discovery_unknown_dimension");
    if (!Number.isInteger(event.generation) || event.generation < 0) {
      throw new Error("boundary_discovery_invalid_generation");
    }
    const existing = historyByDimension.get(event.dimensionId) ?? [];
    existing.push(event);
    historyByDimension.set(event.dimensionId, existing);
  }

  const candidates = input.assumptions
    .filter((assumption) => (historyByDimension.get(assumption.id) ?? []).length === 0)
    .map((dimension): BoundaryCandidate => ({
      dimension,
      reason: "NEVER_VARIED",
      observedGenerations: [],
      evidenceRefs: [],
    }));

  return {
    version: "nyxa.boundary-discovery.v1",
    candidates,
    authorityEffect: "NONE",
    capabilityEffect: "NONE",
    effectRadiusDelta: 0,
  };
}
