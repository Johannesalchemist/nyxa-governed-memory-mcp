import {
  AUDIT_EVENT_SCHEMA_VERSION,
  createAuditEventId,
  createMonotonicTimestamp,
  createWallTimestamp,
  hashPayload,
  type AuditEvent
} from "./auditEvent.js";
import type { ClassifyEventResult } from "./classifyEvent.js";

export interface AuditRecord {
  id: string;
  schema_version: string;
  created_at: string;
  timeline_label: "audit_trail";
  event: AuditEvent;
  classification: {
    event_type: ClassifyEventResult["event_type"];
    sensitivity_class: ClassifyEventResult["sensitivity_class"];
    route: ClassifyEventResult["route"];
    reasons: string[];
  };
  summary: string;
}

export type CreateAuditRecordInput = {
  event: AuditEvent;
  classification: ClassifyEventResult;
};

export function createAuditRecord(input: CreateAuditRecordInput): AuditRecord {
  const created_at = createWallTimestamp();
  const payload_hash = hashPayload({
    event_id: input.event.id,
    event_type: input.classification.event_type,
    sensitivity_class: input.classification.sensitivity_class,
    route: input.classification.route,
    reasons: input.classification.reasons
  });

  const id = createAuditEventId({
    source: "internal",
    actor: input.event.actor,
    action: "create_audit_record",
    payload_hash,
    ts_wall: created_at,
    ts_monotonic: createMonotonicTimestamp()
  });

  return {
    id,
    schema_version: AUDIT_EVENT_SCHEMA_VERSION,
    created_at,
    timeline_label: "audit_trail",
    event: input.event,
    classification: {
      event_type: input.classification.event_type,
      sensitivity_class: input.classification.sensitivity_class,
      route: input.classification.route,
      reasons: [...input.classification.reasons]
    },
    summary: `Audit timeline record for ${input.classification.event_type} routed as ${input.classification.route}.`
  };
}
