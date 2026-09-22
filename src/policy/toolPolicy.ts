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
  "arbeitsbahnhof.task.enqueue": {toolName: "arbeitsbahnhof.task.enqueue", minimumMode: "draft", writesAuthoritativeMemory: false, requiresHumanApproval: false, executionRisk: "low", allowedInV01: true, capabilityClass: "I1"},
  "arbeitsbahnhof.task.claim": {toolName: "arbeitsbahnhof.task.claim", minimumMode: "draft", writesAuthoritativeMemory: false, requiresHumanApproval: false, executionRisk: "low", allowedInV01: true, capabilityClass: "I1"},
  "arbeitsbahnhof.task.result": {toolName: "arbeitsbahnhof.task.result", minimumMode: "draft", writesAuthoritativeMemory: false, requiresHumanApproval: false, executionRisk: "low", allowedInV01: true, capabilityClass: "I1"},
  "arbeitsbahnhof.crm.test_upsert": {toolName: "arbeitsbahnhof.crm.test_upsert", minimumMode: "draft", writesAuthoritativeMemory: false, requiresHumanApproval: false, executionRisk: "low", allowedInV01: true, capabilityClass: "I1"},
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

  // Newsroom: bounded external model consultation.
  // External responses are evidence only and never authority.
  // Reachable only through nyxa_propose_action -> Gamma -> E0 -> ExecutionGate.
  nyxa_newsroom_consult: {
    toolName: "nyxa_newsroom_consult",
    minimumMode: "draft",
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: "low",
    allowedInV01: true,
    capabilityClass: "I1"
  },

  // Self-model reads are always I0 (safe, side-effect-free).
  nyxa_self_model_read: readPolicy("nyxa_self_model_read"),

  // Self-model writes: I1 (reversible dev-tier) for state that legitimately changes at
  // runtime, dispatched only through nyxa_propose_action -> gamma. `identity` is deliberately
  // I2: identity is never directly dispatchable. It can execute only through the governed
  // proposal path when gamma resolves an exact durable mandate and the ExecutionGate admits
  // the bounded effect. Without that authority it escalates and produces no effect.
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
  "memory.status": readPolicy("memory.status"),

  // Phase C: Governed Memory + Dreaming vertical slice. A memory candidate is never
  // authoritative (see schema/candidates.ts), but the WRITE operation itself is a real,
  // persistent mutation and gets the exact same governance treatment as a self-model write:
  // I1 (reversible dev-tier), minimumMode "draft", dispatched only through
  // nyxa_propose_action -> gamma. nyxa_dream_trigger is the same shape again -- it derives its
  // candidate deterministically from existing data (memory/dreamTrigger.ts) but still writes
  // through this identical governed path, never bypassing it.
  nyxa_memory_store_candidate: selfModelWritePolicy("nyxa_memory_store_candidate", "I1"),
  nyxa_dream_trigger: selfModelWritePolicy("nyxa_dream_trigger", "I1"),
  // Recall is read-only and side-effect-free, same treatment as nyxa_self_model_read.
  nyxa_memory_recall_candidates: readPolicy("nyxa_memory_recall_candidates"),

  // Company Audit v1: observations are non-authoritative interview/evidence records.
  // Writes are I1 and may execute only through nyxa_propose_action -> gamma/E0.
  // Reads are side-effect-free I0.
  nyxa_company_audit_record: selfModelWritePolicy("nyxa_company_audit_record", "I1"),
  nyxa_company_audit_read: readPolicy("nyxa_company_audit_read"),

  // Step 11: the first real (non-E2E-fixture) production-shaped human-authority capability.
  // Promotes an already-existing "pending" candidate to "promoted" -- fixed target domain
  // (memory-candidate:/<id>, an existing candidate's own id, never an arbitrary path), fixed
  // schema, no command execution. requiresHumanApproval:true routes gamma's C2 check through
  // governance/humanGrant.ts (see gamma.ts) instead of the unconditional escalate every other
  // requiresHumanApproval tool still gets -- ESCALATE remains the default with no grant
  // presented. executionRisk is "medium", not "high": gamma's C5 check unconditionally
  // escalates every "high"-risk tool with no path back to ALLOW at all (see gamma.ts's own
  // comment: "No current tool is high risk... so one added later isn't silently reachable via
  // ALLOW") -- "high" would make this tool permanently unreachable even with a fully valid
  // grant, which is not what this capability is for. "medium" (the same tier nyxa_apply_patch
  // already uses) is the real, meaningfully-elevated classification that can still reach ALLOW
  // once a human has actually approved it.
  nyxa_memory_promote_candidate: {
    toolName: "nyxa_memory_promote_candidate",
    minimumMode: "draft",
    writesAuthoritativeMemory: true,
    requiresHumanApproval: true,
    executionRisk: "medium",
    allowedInV01: true,
    capabilityClass: "I1"
  },

  // Governance E2E regression fixtures (tests/governance-e2e.test.mjs). Both tools write only
  // inside NYXA_E2E_SCRATCH_ROOT (server.ts executeE2EScratchWrite), which production never
  // sets -- so both are registered (a real, ground-truth ToolPolicy exists for them) but inert
  // in every real deployment. nyxa_e2e_write_scratch is the plain I1 mutation path; its escalate
  // counterpart is policy-identical except requiresHumanApproval:true, so it reaches gamma C2
  // ESCALATE instead of ALLOW -- same real dispatcher, same real handler, only the ground-truth
  // policy differs, proving ESCALATE via an actually-registered tool rather than a direct
  // evaluateProposal() unit call.
  nyxa_e2e_write_scratch: {toolName: "nyxa_e2e_write_scratch", minimumMode: "draft", writesAuthoritativeMemory: false, requiresHumanApproval: false, executionRisk: "low", allowedInV01: true, capabilityClass: "I1"},
  nyxa_e2e_escalate_scratch: {toolName: "nyxa_e2e_escalate_scratch", minimumMode: "draft", writesAuthoritativeMemory: false, requiresHumanApproval: true, executionRisk: "low", allowedInV01: true, capabilityClass: "I1"},

  // Step 11: issues a scoped, single-use, time-bounded grant that unlocks exactly ONE later
  // nyxa_memory_promote_candidate call (see governance/humanGrant.ts, server.ts). Deliberately
  // requiresHumanApproval:false here -- this is the tool that BOOTSTRAPS human authority, so
  // gating it behind the same "requires a grant" check it exists to satisfy would be circular.
  // Its real, only gate is a pre-shared out-of-band secret (NYXA_HUMAN_AUTHORITY_TOKEN),
  // checked inside its own handler, never by gamma/enforcePolicy -- unset in every real
  // deployment by default, so this tool is inert (fail-closed) unless an operator with real
  // host access explicitly configures it, matching the NYXA_E2E_SCRATCH_ROOT precedent.
  // I0/low: issuing a credential is not itself an authoritative-memory mutation -- the actual
  // effect only happens later, through nyxa_memory_promote_candidate's own, separately gated
  // path.
  nyxa_human_grant_issue: {toolName: "nyxa_human_grant_issue", minimumMode: "draft", writesAuthoritativeMemory: false, requiresHumanApproval: false, executionRisk: "low", allowedInV01: true, capabilityClass: "I0"}
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
