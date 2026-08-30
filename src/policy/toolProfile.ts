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

const KNOWN_PROFILES: Readonly<Record<string, ReadonlySet<string>>> = {
  chatgpt_readonly: CHATGPT_READONLY_TOOLS
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
