import { modeSatisfiesMinimum, type NyxaAgentMode } from "./modes.js";
import { TOOL_POLICIES, type ToolPolicy } from "./toolPolicy.js";

export type PolicyDecision = {
  allowed: boolean;
  reason: string;
  policy?: ToolPolicy;
};

export function enforcePolicy(toolName: string, mode: NyxaAgentMode): PolicyDecision {
  const policy = TOOL_POLICIES[toolName];

  if (!policy) {
    return {
      allowed: false,
      reason: "tool_policy_not_found"
    };
  }

  if (!policy.allowedInV01) {
    return {
      allowed: false,
      reason: "tool_not_allowed_in_v01",
      policy
    };
  }

  if (policy.executionRisk === "high") {
    return {
      allowed: false,
      reason: "tool_blocked_high_execution_risk",
      policy
    };
  }

  if (!modeSatisfiesMinimum(mode, policy.minimumMode)) {
    return {
      allowed: false,
      reason: "mode_below_minimum",
      policy
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    policy
  };
}
