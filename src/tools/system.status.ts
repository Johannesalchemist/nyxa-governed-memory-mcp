import type { NyxaConfig } from "../config/env.js";

export type SystemStatusResponse = {
  name: "nyxa-governed-memory-mcp";
  version: "0.1.0";
  agent_mode: string;
  backend: string;
  feature_flags: {
    dreaming_enabled: boolean;
    apprentice_enabled: boolean;
    visual_observation_enabled: boolean;
    drafts_enabled: boolean;
    authoritative_writes_enabled: boolean;
    execution_tools_enabled: boolean;
  };
};

export function buildSystemStatus(config: NyxaConfig): SystemStatusResponse {
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
