/**
 * Per-consumer MCP tool-discovery/invocation profile. This is a pure restriction layer on top of
 * the existing enforcePolicy()/gamma/TOOL_POLICIES enforcement -- it can only ever narrow what a
 * given process instance exposes, never widen it. It grants no capability the underlying
 * NYXA_AGENT_MODE does not already possess: every tool that passes the profile gate still goes
 * through the exact same policy/gamma checks as before this module existed.
 *
 * Read from NYXA_MCP_TOOL_PROFILE exactly once, at process startup (see config/env.ts). There is
 * no code path from an MCP tool call's arguments back into this value -- it is not part of
 * NyxaConfig's mutable state and nothing in this codebase ever reassigns it after construction.
 */

export const CHATGPT_READONLY_TOOLS: ReadonlySet<string> = new Set([
  "system.status",
  "policy.mode",
  "audit.trace",
  "governance.status",
  "governance.trace",
  "gamma.decisions",
  "capability_gate.trace",
  "evidence.latest",
  "evidence.trace",
  "memory.status"
]);

export const CHATGPT_GOVERNED_EXECUTE_TOOLS: ReadonlySet<string> = new Set([
  ...CHATGPT_READONLY_TOOLS,
  "nyxa_memory_recall_candidates",
  "nyxa_company_audit_read",
  "nyxa_propose_action",
  "nyxa_human_grant_issue",
  "nyxa_mandate_issue",
  "nyxa_mandate_revoke",
  "nyxa_mandate_list",

  // Persistent Governed Workloop: bounded execution corridor.
  // This profile remains only an exposure allowlist. ToolPolicy, Gamma, E0,
  // mandates, ExecutionGate and SecureConnector/PathGuard still authorize
  // every actual invocation/effect independently.
  "arbeitsbahnhof.task.enqueue",
  "arbeitsbahnhof.task.claim",
  "arbeitsbahnhof.task.result",

  // Bounded development/inspection tools required for governed autonomous work.
  "nyxa_system_status",
  "nyxa_list",
  "nyxa_read_file",
  "nyxa_search",
  "nyxa_git_status",
  "nyxa_git_diff",
  "nyxa_logs",
  "nyxa_run_test",
  "nyxa_apply_patch",
  "toolbox.list",
  "toolbox.describe",
  "toolbox.health",
  "toolbox.execute"
]);

const KNOWN_PROFILES: Readonly<Record<string, ReadonlySet<string>>> = {
  chatgpt_readonly: CHATGPT_READONLY_TOOLS,
  chatgpt_governed_execute: CHATGPT_GOVERNED_EXECUTE_TOOLS
};

export type ResolvedToolProfile =
  | { active: false }
  | { active: true; name: string; recognized: boolean; allowed: ReadonlySet<string> };

/**
 * Unset/empty env var -> inactive (full existing behavior, unchanged). Any non-empty value that
 * does not match a known profile name fails CLOSED: it is treated as an active profile with an
 * EMPTY allowlist (tools/list returns nothing, every tools/call is denied) rather than silently
 * falling back to "no restriction" on a typo or misconfiguration.
 */
export function resolveToolProfile(rawValue: string | undefined): ResolvedToolProfile {
  const value = rawValue?.trim();
  if (!value) return { active: false };
  const allowed = KNOWN_PROFILES[value];
  if (allowed) return { active: true, name: value, recognized: true, allowed };
  return { active: true, name: value, recognized: false, allowed: new Set() };
}

export function isToolAllowedByProfile(profile: ResolvedToolProfile, toolName: string): boolean {
  if (!profile.active) return true;
  return profile.allowed.has(toolName);
}
