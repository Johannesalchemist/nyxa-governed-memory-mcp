import { TOOL_POLICIES } from "../policy/toolPolicy.js";
import { enforcePolicy } from "../policy/enforcePolicy.js";
import { isToolAllowedByProfile } from "../policy/toolProfile.js";
export const POLICY_MODE_TOOL_ANNOTATIONS = {
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
};
export function buildPolicyMode(config) {
    const profile = config.toolProfile ?? { active: false };
    const tools = Object.keys(TOOL_POLICIES).map(tool => {
        const decision = enforcePolicy(tool, config.agentMode);
        const exposed = isToolAllowedByProfile(profile, tool);
        return { tool, exposed_by_profile: exposed,
            policy_allowed: decision.allowed,
            outcome: exposed ? decision.outcome : "DENIED",
            reason: exposed ? decision.reason : "tool_not_allowed_by_profile" };
    });
    return {
        mode: config.agentMode,
        tool_profile: profile.active ? profile.name : null,
        scope: "Direct-call policy preflight only. Feature flags are configuration, not authorization. Proposal actions are evaluated separately by gamma/E0, mandates, execution gate and connector constraints; a policy allowance does not guarantee dispatch or effect.",
        allowed_capabilities: tools.filter(t => t.exposed_by_profile && t.policy_allowed).map(t => t.tool),
        blocked_capabilities: tools.filter(t => !t.exposed_by_profile || !t.policy_allowed).map(t => t.tool),
        tools
    };
}
