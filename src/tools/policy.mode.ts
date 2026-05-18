import type { NyxaConfig } from "../config/env.js";

export type PolicyModeResponse = {
  mode: string;
  allowed_capabilities: string[];
  blocked_capabilities: string[];
};

export function buildPolicyMode(config: NyxaConfig): PolicyModeResponse {
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
