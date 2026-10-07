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

  // Kernel V1 direct-call closure: every effect-bearing capability (I1/I2/I3) must execute
  // through nyxa_propose_action -> Kernel Contract -> Gamma/authority -> ExecutionGate -> replay
  // guard -> handler. Direct calls have no canonical effect envelope, so admitting even a bounded
  // I1 here would create a kernel bypass. I0 remains directly callable because it is non-effecting.
  if (policy.capabilityClass !== "I0") {
    return {
      allowed: false,
      reason: "effect_requires_kernel_dispatch",
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
