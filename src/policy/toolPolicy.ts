import type { NyxaAgentMode } from "./modes.js";
import type { CapabilityClass } from "../connector/types.js";

export type ToolPolicy = {
  toolName: string;
  minimumMode: NyxaAgentMode;
  writesAuthoritativeMemory: boolean;
  requiresHumanApproval: boolean;
  executionRisk: "none" | "low" | "medium" | "high";
  allowedInV01: boolean;
  capabilityClass: CapabilityClass;
};

export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  "system.status": {
    toolName: "system.status",
    minimumMode: "observe_only",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: "none",
    allowedInV01: true,
    capabilityClass: "I0"
  },
  "policy.mode": {
    toolName: "policy.mode",
    minimumMode: "observe_only",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: "none",
    allowedInV01: true,
    capabilityClass: "I0"
  },
  "audit.trace": {
    toolName: "audit.trace",
    minimumMode: "observe_only",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: "none",
    allowedInV01: true,
    capabilityClass: "I0"
  },
  nyxa_system_status: readPolicy("nyxa_system_status"),
  nyxa_list: readPolicy("nyxa_list"),
  nyxa_read_file: readPolicy("nyxa_read_file"),
  nyxa_search: readPolicy("nyxa_search"),
  nyxa_git_status: readPolicy("nyxa_git_status"),
  nyxa_git_diff: readPolicy("nyxa_git_diff"),
  nyxa_logs: readPolicy("nyxa_logs"),
  nyxa_run_test: devPolicy("nyxa_run_test", "low"),
  nyxa_apply_patch: devPolicy("nyxa_apply_patch", "medium"),
  // Proposing is always safe (I0) — only the underlying action, once ALLOWed by gamma, carries
  // real risk, and that action is checked against its OWN ToolPolicy, not this one.
  nyxa_propose_action: readPolicy("nyxa_propose_action")
};

function readPolicy(toolName: string): ToolPolicy {
  return {
    toolName,
    minimumMode: "observe_only",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: "none",
    allowedInV01: true,
    capabilityClass: "I0"
  };
}

function devPolicy(toolName: string, executionRisk: "low" | "medium"): ToolPolicy {
  return {
    toolName,
    minimumMode: "draft",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk,
    allowedInV01: true,
    capabilityClass: "I1"
  };
}
