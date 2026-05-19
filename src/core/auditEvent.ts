import { createHash } from "node:crypto";
import { safeJsonStringify } from "../utils/safeJson.js";

export type AuditEventSource =
  | "mcp-stdio"
  | "http-gateway"
  | "hook"
  | "proxy"
  | "internal";

export type AuditEventType =
  | "tool_call"
  | "classification"
  | "open_signal"
  | "audit_record"
  | "memory_candidate"
  | "policy_decision";

export type SensitivityClass =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "DREAM"
  | "BIOMETRIC"
  | "RESEARCH_ONLY";

export const AUDIT_EVENT_SCHEMA_VERSION = "0.1";

export type AuditEventIdInput = {
  source: AuditEventSource;
  actor: string;
  action: string;
  payload_hash: string;
  ts_wall: string;
  ts_monotonic: number;
};

export interface AuditEvent {
  id: string;
  source: AuditEventSource;
  actor: string;
  action: string;
  payload_hash: string;
  ts_monotonic: number;
  ts_wall: string;
  schema_version: string;
  context_id?: string;
  session_id?: string;
  correlation_id?: string;
  sensitivity_class?: SensitivityClass;
  event_type?: AuditEventType;
  integrity_hash?: string;
  metadata?: Record<string, unknown>;
}

export function createMonotonicTimestamp(): number {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return Date.now();
}

export function createWallTimestamp(): string {
  return new Date().toISOString();
}

export function hashPayload(payload: unknown): string {
  const canonical = safeJsonStringify(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

export function createAuditEventId(input: AuditEventIdInput): string {
  const material = [
    input.source,
    input.actor,
    input.action,
    input.payload_hash,
    input.ts_wall,
    String(input.ts_monotonic)
  ].join("|");

  const digest = createHash("sha256").update(material).digest("hex");
  return `evt_${digest.slice(0, 32)}`;
}
