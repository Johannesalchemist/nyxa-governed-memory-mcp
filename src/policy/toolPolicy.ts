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
  nyxa_propose_action: readPolicy("nyxa_propose_action"),

  // Self-model reads are always I0 (safe, side-effect-free).
  nyxa_self_model_read: readPolicy("nyxa_self_model_read"),

  // Self-model writes: I1 (reversible dev-tier) for state that legitimately changes at
  // runtime, dispatched only through nyxa_propose_action -> gamma. `identity` is deliberately
  // I2: gamma's C3 check unconditionally denies I2/I3, so identity cannot be changed through
  // this governed runtime path at all in v1 -- it can only be seeded at deploy time by writing
  // data/self-model/identity.json directly. That is intentional: identity is meant to be
  // stable, not something a running proposal can casually rewrite.
  nyxa_self_model_write_identity: selfModelWritePolicy("nyxa_self_model_write_identity", "I2"),
  nyxa_self_model_write_personality: selfModelWritePolicy("nyxa_self_model_write_personality", "I1"),
  nyxa_self_model_write_self_model: selfModelWritePolicy("nyxa_self_model_write_self_model", "I1"),
  nyxa_self_model_write_current_state: selfModelWritePolicy("nyxa_self_model_write_current_state", "I1"),
  nyxa_self_model_write_belief: selfModelWritePolicy("nyxa_self_model_write_belief", "I1"),
  nyxa_self_model_write_capability_limitation: selfModelWritePolicy(
    "nyxa_self_model_write_capability_limitation",
    "I1"
  ),
  nyxa_self_model_write_goal: selfModelWritePolicy("nyxa_self_model_write_goal", "I1"),
  nyxa_self_model_write_autobiographical_event: selfModelWritePolicy(
    "nyxa_self_model_write_autobiographical_event",
    "I1"
  ),

  // Phase 1 observability extension: read-only filtered views over data this MCP already
  // produces (TOOL_POLICIES itself, gamma decisions, capability-class/policy-decision audit
  // fields, ConnectorResult.evidence, LocalBackend.health()). All I0, observe_only, no new
  // authority -- identical treatment to the pre-existing nyxa_* read tools.
  "governance.status": readPolicy("governance.status"),
  "governance.trace": readPolicy("governance.trace"),
  "gamma.decisions": readPolicy("gamma.decisions"),
  "capability_gate.trace": readPolicy("capability_gate.trace"),
  "evidence.latest": readPolicy("evidence.latest"),
  "evidence.trace": readPolicy("evidence.trace"),
  "memory.status": readPolicy("memory.status")
};

function selfModelWritePolicy(toolName: string, capabilityClass: CapabilityClass): ToolPolicy {
  return {
    toolName,
    minimumMode: "draft",
    writesAuthoritativeMemory: true,
    requiresHumanApproval: false,
    executionRisk: "low",
    allowedInV01: true,
    capabilityClass
  };
}

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
