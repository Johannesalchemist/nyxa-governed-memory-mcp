import type { ConnectorEvidence } from "../connector/types.js";
import type { GammaDomain, GammaOutcome } from "../governance/gamma.js";

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
  policy_decision?: "ALLOWED" | "DENIED" | "REQUIRES_APPROVAL" | "INVALID" | "UNKNOWN";
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
};
