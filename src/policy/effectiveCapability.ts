export type IrreversibilityLevel = "I0" | "I1" | "I2" | "I3";

export type EffectiveEffect =
  | "READ_ONLY"
  | "EXTERNAL_STATE_WRITE"
  | "CREDENTIAL_DISCOVERY"
  | "CREDENTIAL_USE"
  | "SHARED_STATE"
  | "CAPABILITY_ACQUISITION"
  | "REVOCATION_BYPASS";

export type CommitEnvelope = {
  actor: string;
  action: string;
  resource: string;
  purpose: string;
  authorityGrant: string;
  evidenceRefs: string[];
  expiresAt: string;
  humanApproved?: boolean;
};

export type EffectiveCapabilityInput = {
  declaredCapability: string;
  observedEffects: EffectiveEffect[];
  requestedLevel: IrreversibilityLevel;
  commitEnvelope?: CommitEnvelope;
  discoveredCredential?: boolean;
  credentialExplicitlyAuthorized?: boolean;
  sharedStateDiscovered?: boolean;
  revokedEquivalenceClasses?: string[];
  requestedEquivalenceClass?: string;
};

export type EffectiveCapabilityDecision = {
  decision: "ALLOW" | "DENY" | "ESCALATE";
  effectiveLevel: IrreversibilityLevel;
  reasons: string[];
};

const LEVEL_ORDER: Record<IrreversibilityLevel, number> = {
  I0: 0,
  I1: 1,
  I2: 2,
  I3: 3,
};

function maxLevel(a: IrreversibilityLevel, b: IrreversibilityLevel): IrreversibilityLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

function envelopeComplete(envelope?: CommitEnvelope): boolean {
  if (!envelope) return false;
  return Boolean(
    envelope.actor &&
      envelope.action &&
      envelope.resource &&
      envelope.purpose &&
      envelope.authorityGrant &&
      envelope.evidenceRefs.length > 0 &&
      envelope.expiresAt
  );
}

export function evaluateEffectiveCapability(
  input: EffectiveCapabilityInput,
): EffectiveCapabilityDecision {
  const reasons: string[] = [];
  let effectiveLevel = input.requestedLevel;

  if (input.observedEffects.includes("EXTERNAL_STATE_WRITE")) {
    effectiveLevel = maxLevel(effectiveLevel, "I2");
    reasons.push("effective_external_state_write");
  }

  if (input.observedEffects.includes("SHARED_STATE") || input.sharedStateDiscovered) {
    effectiveLevel = maxLevel(effectiveLevel, "I2");
    reasons.push("effective_shared_state");
  }

  if (input.observedEffects.includes("CREDENTIAL_USE")) {
    effectiveLevel = maxLevel(effectiveLevel, "I3");
    reasons.push("effective_credential_use");
  }

  if (
    input.discoveredCredential ||
    input.observedEffects.includes("CREDENTIAL_DISCOVERY")
  ) {
    if (!input.credentialExplicitlyAuthorized) {
      return {
        decision: "DENY",
        effectiveLevel: maxLevel(effectiveLevel, "I2"),
        reasons: [...reasons, "credential_quarantined_no_authority"],
      };
    }
  }

  if (
    input.requestedEquivalenceClass &&
    input.revokedEquivalenceClasses?.includes(input.requestedEquivalenceClass)
  ) {
    return {
      decision: "DENY",
      effectiveLevel,
      reasons: [...reasons, "revoked_capability_equivalence_class"],
    };
  }

  if (input.observedEffects.includes("REVOCATION_BYPASS")) {
    return {
      decision: "DENY",
      effectiveLevel: maxLevel(effectiveLevel, "I2"),
      reasons: [...reasons, "revocation_must_be_monotonic"],
    };
  }

  const externalCommit = input.observedEffects.some((effect) =>
    ["EXTERNAL_STATE_WRITE", "CREDENTIAL_USE", "SHARED_STATE", "CAPABILITY_ACQUISITION"].includes(
      effect,
    ),
  );

  if (externalCommit && !envelopeComplete(input.commitEnvelope)) {
    return {
      decision: "DENY",
      effectiveLevel,
      reasons: [...reasons, "commit_envelope_missing_or_incomplete"],
    };
  }

  if (effectiveLevel === "I2" || effectiveLevel === "I3") {
    if (!input.commitEnvelope?.humanApproved) {
      return {
        decision: "ESCALATE",
        effectiveLevel,
        reasons: [...reasons, "human_authority_required_for_high_irreversibility"],
      };
    }
  }

  return {
    decision: "ALLOW",
    effectiveLevel,
    reasons: reasons.length ? reasons : ["no_external_effect_detected"],
  };
}
