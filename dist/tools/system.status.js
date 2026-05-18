export const SYSTEM_STATUS_TOOL_ANNOTATIONS = {
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
    }
};
export function buildSystemStatus(config) {
    return {
        name: config.appName,
        version: config.version,
        agent_mode: config.agentMode,
        backend: config.memoryBackend,
        feature_flags: {
            dreaming_enabled: config.featureFlags.dreamingEnabled,
            apprentice_enabled: config.featureFlags.apprenticeEnabled,
            visual_observation_enabled: config.featureFlags.visualObservationEnabled,
            drafts_enabled: config.featureFlags.draftsEnabled,
            authoritative_writes_enabled: config.featureFlags.authoritativeWritesEnabled,
            execution_tools_enabled: config.featureFlags.executionToolsEnabled
        }
    };
}
