import type { AuditEventType, SensitivityClass } from "./auditEvent.js";
import {
  classifySensitivity,
  type ClassifySensitivityInput,
  type SensitivityReasonCode
} from "./classifySensitivity.js";

export type EventRoute =
  | "discard"
  | "memory_candidate"
  | "open_signal"
  | "audit_record"
  | "requires_validation"
  | "research_aggregate_only";

export type ClassifyEventInput = ClassifySensitivityInput & {
  event_type_hint?: AuditEventType;
};

export type ClassifyEventResult = {
  event_type: AuditEventType;
  sensitivity_class: SensitivityClass;
  route: EventRoute;
  reasons: string[];
};

function detectEventType(input: ClassifyEventInput): AuditEventType {
  if (input.event_type_hint) {
    return input.event_type_hint;
  }

  const text = `${String(input.action ?? "")} ${String(input.content ?? "")}`.toLowerCase();

  if (text.includes("policy") || text.includes("governance")) {
    return "policy_decision";
  }

  if (text.includes("tool") || text.includes("call")) {
    return "tool_call";
  }

  if (text.includes("open signal") || text.includes("uncertain")) {
    return "open_signal";
  }

  if (text.includes("audit") || text.includes("timeline")) {
    return "audit_record";
  }

  return "memory_candidate";
}

function shouldRouteToAuditRecord(eventType: AuditEventType): boolean {
  return eventType === "tool_call" || eventType === "policy_decision" || eventType === "audit_record";
}

export function classifyEvent(input: ClassifyEventInput): ClassifyEventResult {
  const eventType = detectEventType(input);
  const sensitivity = classifySensitivity(input);
  const reasons: string[] = [...(sensitivity.reasons as SensitivityReasonCode[])];

  if (sensitivity.sensitivity_class === "DREAM") {
    reasons.push("route_open_signal_for_dream");
    return {
      event_type: eventType,
      sensitivity_class: sensitivity.sensitivity_class,
      route: "open_signal",
      reasons
    };
  }

  if (sensitivity.sensitivity_class === "BIOMETRIC") {
    const explicitResearch = sensitivity.reasons.includes("explicit_research_only_requested");
    reasons.push(explicitResearch ? "route_research_aggregate_only_for_biometric" : "route_requires_validation_for_biometric");
    return {
      event_type: eventType,
      sensitivity_class: sensitivity.sensitivity_class,
      route: explicitResearch ? "research_aggregate_only" : "requires_validation",
      reasons
    };
  }

  if (sensitivity.sensitivity_class === "HIGH") {
    reasons.push("route_requires_validation_for_high");
    return {
      event_type: eventType,
      sensitivity_class: sensitivity.sensitivity_class,
      route: "requires_validation",
      reasons
    };
  }

  if (sensitivity.sensitivity_class === "RESEARCH_ONLY") {
    reasons.push("route_research_aggregate_only");
    return {
      event_type: eventType,
      sensitivity_class: sensitivity.sensitivity_class,
      route: "research_aggregate_only",
      reasons
    };
  }

  const route = shouldRouteToAuditRecord(eventType) ? "audit_record" : "memory_candidate";
  reasons.push(route === "audit_record" ? "route_audit_record_for_operational_intent" : "route_memory_candidate_for_low_medium");

  return {
    event_type: eventType,
    sensitivity_class: sensitivity.sensitivity_class,
    route,
    reasons
  };
}
