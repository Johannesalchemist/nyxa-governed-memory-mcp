import {
  createAuditEventId,
  createMonotonicTimestamp,
  createWallTimestamp,
  hashPayload,
  type SensitivityClass
} from "./auditEvent.js";

export type OpenSignal = {
  id: string;
  source_event_id?: string;
  actor: string;
  action: string;
  content: string;
  sensitivity_class: Extract<SensitivityClass, "DREAM" | "HIGH" | "RESEARCH_ONLY" | "BIOMETRIC">;
  interpretation: "FORBIDDEN";
  window_status: "CLOSED";
  created_at: string;
  expires_at: string;
  ttl_ms: number;
  metadata?: Record<string, unknown>;
};

export type HoldOpenSignalInput = {
  actor: string;
  action: string;
  content: string;
  sensitivity_class: OpenSignal["sensitivity_class"];
  source_event_id?: string;
  ttl_ms?: number;
  expires_at?: string;
  metadata?: Record<string, unknown>;
};

function resolveExpiry(input: HoldOpenSignalInput, nowMs: number): { expires_at: string; ttl_ms: number } {
  if (typeof input.ttl_ms === "number") {
    if (!Number.isFinite(input.ttl_ms) || input.ttl_ms <= 0) {
      throw new Error("invalid_ttl_ms");
    }

    return {
      expires_at: new Date(nowMs + input.ttl_ms).toISOString(),
      ttl_ms: Math.floor(input.ttl_ms)
    };
  }

  if (typeof input.expires_at === "string" && input.expires_at.trim() !== "") {
    const expiresMs = Date.parse(input.expires_at);
    if (Number.isNaN(expiresMs) || expiresMs <= nowMs) {
      throw new Error("invalid_expires_at");
    }

    return {
      expires_at: new Date(expiresMs).toISOString(),
      ttl_ms: expiresMs - nowMs
    };
  }

  throw new Error("ttl_required");
}

export function holdOpenSignal(input: HoldOpenSignalInput): OpenSignal {
  const nowMs = Date.now();
  const created_at = createWallTimestamp();
  const expiry = resolveExpiry(input, nowMs);
  const payload_hash = hashPayload({
    actor: input.actor,
    action: input.action,
    content: input.content,
    sensitivity_class: input.sensitivity_class,
    source_event_id: input.source_event_id ?? ""
  });

  const id = createAuditEventId({
    source: "internal",
    actor: input.actor,
    action: input.action,
    payload_hash,
    ts_wall: created_at,
    ts_monotonic: createMonotonicTimestamp()
  });

  const signal: OpenSignal = {
    id,
    actor: input.actor,
    action: input.action,
    content: input.content,
    sensitivity_class: input.sensitivity_class,
    interpretation: "FORBIDDEN",
    window_status: "CLOSED",
    created_at,
    expires_at: expiry.expires_at,
    ttl_ms: expiry.ttl_ms
  };

  if (input.source_event_id) {
    signal.source_event_id = input.source_event_id;
  }

  if (input.metadata) {
    signal.metadata = input.metadata;
  }

  return signal;
}
