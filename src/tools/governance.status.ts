import type { NyxaConfig } from "../config/env.js";
import { TOOL_POLICIES } from "../policy/toolPolicy.js";

/**
 * Reports exactly what governance machinery exists in THIS MCP's own process and nothing more.
 * Deliberately does not describe /opt/nyxa/core/governance or /opt/thechat/core/governance --
 * those are a separate system (Room/persona-level conversational governance) this MCP has no
 * connector root for and cannot observe. Does not invent stages: E0 is reported as
 * not_implemented because it does not exist anywhere in this codebase (verified by search).
 */
export function buildGovernanceStatus(config: NyxaConfig) {
  return {
    scope:
      "This MCP's own tool-execution governance (nyxa_propose_action -> gamma) only. " +
      "Room/persona-level conversational governance on this host (constitution.json, " +
      "failsafe.json, state_modes.json, thechat/core/governance/*) is a separate system, " +
      "not observed by this tool.",
    mode: config.agentMode,
    gamma_engine: {
      implemented: true,
      module: "src/governance/gamma.ts",
      pure_deterministic: true,
      checks_in_order: [
        { domain: "C1", name: "Constraints", description: "known/allowed tool, and target is not the governance/connector control plane" },
        { domain: "C2", name: "Authority", description: "caller mode meets the tool's minimum; human-approval requirement escalates" },
        { domain: "C3", name: "Irreversibility", description: "ground truth is the tool's real capabilityClass, never the proposer's estimate; I2/I3 never authorizable" },
        { domain: "C4", name: "Provenance validity", description: "every claim needs a non-blank source; EXTERNAL_EVIDENCE claims expire after 24h" },
        { domain: "C5", name: "Escalation reachability", description: "any future high-execution-risk tool always routes to a human" },
        { domain: "E0", name: null, description: "not_implemented -- no such stage exists in this codebase" }
      ],
      possible_outcomes: ["ALLOW", "DENY", "ESCALATE", "DEGRADE", "UNKNOWN"]
    },
    advisory_fields: {
      alpha: "proposal.rationale -- free-text argument FOR the action, recorded for audit only, never read by gamma",
      beta: "proposal.opposition -- free-text argument AGAINST the action, recorded for audit only, never read by gamma"
    },
    capability_gate: {
      implemented: true,
      as_named_module: "not_implemented -- no module literally named 'Capability Gate' exists",
      functional_equivalent: "TOOL_POLICIES[tool].capabilityClass (I0-I3), checked in gamma C3 and enforced independently by SecureConnector/PathGuard for direct tool calls"
    },
    registered_tool_count: Object.keys(TOOL_POLICIES).length
  };
}
