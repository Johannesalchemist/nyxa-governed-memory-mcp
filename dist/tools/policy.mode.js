export const POLICY_MODE_TOOL_ANNOTATIONS = {
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true
    }
};
export function buildPolicyMode(config) {
    return {
        mode: config.agentMode,
        allowed_capabilities: [
            "read",
            "observe",
            "audit",
            "document_candidates_future"
        ],
        blocked_capabilities: [
            "send_email",
            "write_files",
            "execute_shell",
            "modify_external_systems",
            "autonomous_execution",
            "hidden_screen_capture"
        ]
    };
}
