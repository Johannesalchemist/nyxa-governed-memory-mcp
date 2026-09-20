import { modeSatisfiesMinimum, type NyxaAgentMode } from "./modes.js";
import { TOOL_POLICIES, type ToolPolicy } from "./toolPolicy.js";

export type PolicyDecision = {
  allowed: boolean;
  reason: string;
  policy?: ToolPolicy;
  outcome: "ALLOWED" | "DENIED" | "REQUIRES_APPROVAL" | "INVALID" | "UNKNOWN";
};

export function enforcePolicy(toolName: string, mode: NyxaAgentMode): PolicyDecision {
  const policy = TOOL_POLICIES[toolName];

  if (!policy) {
    return {
      allowed: false,
      reason: "tool_policy_not_found",
      outcome: "UNKNOWN"
    };
  }

  if (!policy.allowedInV01) {
    return {
      allowed: false,
      reason: "tool_not_allowed_in_v01",
      outcome: policy.requiresHumanApproval ? "REQUIRES_APPROVAL" : "DENIED",
      policy
    };
  }

  if (policy.executionRisk === "high") {
    return {
      allowed: false,
      reason: "tool_blocked_high_execution_risk",
      outcome: "DENIED",
      policy
    };
  }

  if (!modeSatisfiesMinimum(mode, policy.minimumMode)) {
    return {
      allowed: false,
      reason: "mode_below_minimum",
      outcome: "DENIED",
      policy
    };
  }

  // Mirrors gamma's C2 human-approval check (governance/gamma.ts) for the direct-call path.
  // Ground truth only -- there is no proposal envelope here for a caller to falsify this field
  // on, it comes straight from TOOL_POLICIES. No currently-registered tool sets this, so this
  // branch is not live-reachable today; it exists so a future tool that does set it is never
  // silently ALLOWED via direct call while gamma would correctly ESCALATE the identical tool
  // via the proposal path -- the two enforcement points must agree on this field.
  if (policy.requiresHumanApproval) {
    return {
      allowed: false,
      reason: "human_approval_required",
      outcome: "REQUIRES_APPROVAL",
      policy
    };
  }

  // Direct-call authority closure for I2/I3: higher capability is never dispatchable directly.
  // A scoped server-resolved mandate may authorize I2/I3 only through nyxa_propose_action ->
  // gamma -> ExecutionGate. The direct path has no proposal envelope or mandate resolution, so
  // it must fail closed rather than trying to emulate delegated authority with missing context.
  if (policy.capabilityClass === "I2" || policy.capabilityClass === "I3") {
    return {
      allowed: false,
      reason: `capability_class_${policy.capabilityClass}_not_authorizable`,
      outcome: "DENIED",
      policy
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    outcome: "ALLOWED",
    policy
  };
}
