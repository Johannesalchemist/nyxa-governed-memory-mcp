import type { ConnectorEvidence } from "../connector/types.js";
import type { GammaDomain, GammaOutcome } from "../governance/gamma.js";
import type { C0Outcome } from "../governance/c0.js";

export type AuditEvent = {
  id: string;
  timestamp: string;
  actor: "mcp" | "user" | "agent" | "system";
  action: string;
  tool?: string;
  mode: string;
  backend: string;
  result: "allowed" | "blocked" | "error";
  details?: Record<string, unknown>;
  capability_class?: "I0" | "I1" | "I2" | "I3";
  policy_decision?: "ALLOWED" | "DENIED" | "REQUIRES_APPROVAL" | "INVALID" | "UNKNOWN" | "HELD";
  arguments_hash?: string;
  affected_resource?: string;
  duration_ms?: number;
  result_status?: string;
  previous_event_hash?: string;
  event_hash?: string;
  requesting_identity?: string;
  /** Persisted verbatim from the already-produced ConnectorResult.evidence -- see
   *  Phase 1 observability extension. Only present for calls that actually returned one. */
  evidence?: ConnectorEvidence;
  /** Persisted verbatim from governance/gamma.ts's real decision for nyxa_propose_action calls
   *  made after this extension. Never fabricated for older entries -- see tools/gamma.decisions.ts. */
  gamma_outcome?: GammaOutcome;
  gamma_domain?: GammaDomain;
  gamma_reason?: string;
  /** Persisted verbatim from governance/c0.ts's real decision for nyxa_propose_action calls made
   *  after the Phase 1 C0 Target Safety extension. C0 runs BEFORE gamma and is recorded
   *  separately from the gamma_* fields above -- a c0_outcome of "DENY" means gamma was never
   *  even invoked for this call. Present on every nyxa_propose_action audit entry going forward
   *  (PASS included), not only on denials, per the requirement that every C0 decision be
   *  auditable. */
  c0_outcome?: C0Outcome;
  c0_reason?: string;
  c0_local_server_id?: string;
  c0_expected_target?: string;
  /** Step 11: the human-authority decision layer (governance/humanGrant.ts), kept separate
   *  from gamma_outcome/policy_decision/result on purpose -- a presented grant is validated
   *  BEFORE gamma runs, and gamma's own C2 outcome can differ from this status (e.g. gamma
   *  ultimately DENYs for an unrelated reason even though the grant itself was valid). Present
   *  only for nyxa_propose_action calls targeting a tool with requiresHumanApproval:true that
   *  also presented a proposal.payload.humanGrant reference; absent (not merely "not_presented")
   *  for every other call, so this field's mere presence already signals "a grant was checked
   *  here." */
  human_grant_status?: string;
  human_grant_id?: string;
  /** Step 11B: the epistemic-sufficiency layer (epistemic/e0.ts, epistemic/integration.ts),
   *  kept separate from gamma_outcome/human_grant_status/policy_decision/result_status on
   *  purpose -- EPISTEMIC_HOLD is not a Gamma outcome, not a human-authority decision, and not
   *  itself DENY. Present only for nyxa_propose_action calls where requiresEpistemicAssessment
   *  actually ran E0 (never for bypassed pure reads); absent means E0 was not assessed for this
   *  call at all, not that it silently passed. */
  epistemic_classification?: string;
  epistemic_hold?: boolean;
};
