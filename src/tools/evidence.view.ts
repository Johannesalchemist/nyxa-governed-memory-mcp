import type { AuditEvent } from "../schema/audit.js";

/**
 * Shared projection backing both evidence.latest (small default limit) and evidence.trace
 * (larger default limit) -- same underlying data, same filter, only the caller-chosen limit
 * differs. Reuses the ConnectorEvidence object every I0/I1 tool call already produces; this
 * extension's only change was persisting it into the audit log (see server.ts auditConnector /
 * auditGovernance) instead of discarding it after the response was sent.
 */
export function buildEvidenceView(events: AuditEvent[], limit: number) {
  const matched = events.filter((event) => event.evidence !== undefined);
  const projected = matched.map((event) => ({
    timestamp: event.timestamp,
    tool: event.tool ?? null,
    affected_resource: event.affected_resource ?? null,
    evidence: event.evidence
  }));
  const selected = projected.slice(-limit);
  return {
    evidence: selected,
    returned: selected.length,
    matched: projected.length,
    scanned: events.length,
    truncated: projected.length > selected.length
  };
}
