import type { AuditEvent } from "../schema/audit.js";

/**
 * Projects only the real gamma decision fields (outcome/domain/reason) out of the existing
 * audit log for nyxa_propose_action calls. Entries recorded before this observability
 * extension shipped have no gamma_outcome/gamma_domain/gamma_reason on disk -- they are
 * reported as null, never backfilled or guessed.
 */
export function buildGammaDecisions(events: AuditEvent[], limit: number) {
  const matched = events.filter((event) => event.tool === "nyxa_propose_action");
  const projected = matched.map((event) => ({
    timestamp: event.timestamp,
    outcome: event.gamma_outcome ?? null,
    domain: event.gamma_domain ?? null,
    reason: event.gamma_reason ?? null,
    capability_class: event.capability_class ?? null,
    affected_resource: event.affected_resource ?? null,
    result: event.result
  }));
  const selected = projected.slice(-limit);
  return {
    decisions: selected,
    returned: selected.length,
    matched: projected.length,
    scanned: events.length,
    truncated: projected.length > selected.length,
    note: "Entries with null gamma fields were recorded before this observability extension and were not backfilled."
  };
}
