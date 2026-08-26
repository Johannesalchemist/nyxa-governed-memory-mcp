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

  return {
    allowed: true,
    reason: "allowed",
    outcome: "ALLOWED",
    policy
  };
}
