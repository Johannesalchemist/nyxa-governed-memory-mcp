import type { AuditEvent } from "../schema/audit.js";

/**
 * The functional "capability gate" in this codebase is TOOL_POLICIES[tool].capabilityClass
 * (I0-I3) checked per call. This is a filtered view over the audit log of every call that
 * carries that enforcement decision, across ALL tools (connector, governance, self-model,
 * legacy) -- not only proposals.
 */
export function buildCapabilityGateTrace(events: AuditEvent[], limit: number) {
  const matched = events.filter((event) => event.capability_class !== undefined);
  const projected = matched.map((event) => ({
    timestamp: event.timestamp,
    tool: event.tool ?? null,
    capability_class: event.capability_class ?? null,
    policy_decision: event.policy_decision ?? null,
    affected_resource: event.affected_resource ?? null,
    result: event.result
  }));
  const selected = projected.slice(-limit);
  return {
    decisions: selected,
    returned: selected.length,
    matched: projected.length,
    scanned: events.length,
    truncated: projected.length > selected.length
  };
}
