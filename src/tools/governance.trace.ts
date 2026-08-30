import type { AuditEvent } from "../schema/audit.js";

/**
 * Filtered, read-only view over the existing hash-chained audit log: full audit records for
 * nyxa_propose_action calls only. No new storage, no new trust surface -- same events
 * audit.trace already exposes, just pre-filtered to the governance-relevant subset.
 */
export function buildGovernanceTrace(events: AuditEvent[], limit: number) {
  const matched = events.filter((event) => event.tool === "nyxa_propose_action");
  const selected = matched.slice(-limit);
  return {
    events: selected,
    returned: selected.length,
    matched: matched.length,
    scanned: events.length,
    truncated: matched.length > selected.length
  };
}
