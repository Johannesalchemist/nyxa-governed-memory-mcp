import type { AuditEvent } from "../schema/audit.js";

export const AUDIT_TRACE_TOOL_ANNOTATIONS = {
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
} as const;

export type AuditTraceInput = {
  limit?: number | undefined;
};

export type AuditTraceResponse = {
  events: AuditEvent[];
};

export function normalizeAuditTraceLimit(input: AuditTraceInput): number {
  const fallback = 20;
  const rawLimit = input.limit;

  if (rawLimit === undefined || Number.isNaN(rawLimit)) {
    return fallback;
  }

  const bounded = Math.min(100, Math.max(1, Math.floor(rawLimit)));
  return bounded;
}

export function buildAuditTrace(events: AuditEvent[]): AuditTraceResponse {
  return { events };
}
