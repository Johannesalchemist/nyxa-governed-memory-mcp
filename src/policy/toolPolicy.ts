import type { NyxaAgentMode } from "./modes.js";

export type ToolPolicy = {
  toolName: string;
  minimumMode: NyxaAgentMode;
  writesAuthoritativeMemory: boolean;
  requiresHumanApproval: boolean;
  executionRisk: "none" | "low" | "medium" | "high";
  allowedInV01: boolean;
};

export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  "system.status": {
    toolName: "system.status",
    minimumMode: "observe_only",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: "none",
    allowedInV01: true
  },
  "policy.mode": {
    toolName: "policy.mode",
    minimumMode: "observe_only",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: "none",
    allowedInV01: true
  },
  "audit.trace": {
    toolName: "audit.trace",
    minimumMode: "observe_only",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: "none",
    allowedInV01: true
  }
};
