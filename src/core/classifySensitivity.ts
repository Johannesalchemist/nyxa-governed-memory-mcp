import type { SensitivityClass } from "./auditEvent.js";

export type SensitivityReasonCode =
  | "biometric_terms_detected"
  | "dream_symbolic_terms_detected"
  | "high_sensitivity_terms_detected"
  | "medium_sensitivity_terms_detected"
  | "explicit_research_only_requested"
  | "default_low";

export type ClassifySensitivityInput = {
  action?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  explicit_research_only?: boolean;
};

export type ClassifySensitivityResult = {
  sensitivity_class: SensitivityClass;
  reasons: SensitivityReasonCode[];
};

const BIOMETRIC_TERMS = [
  "hrv",
  "heart rate",
  "pulse",
  "blood pressure",
  "bp",
  "skin conductance",
  "galvanic",
  "pupil",
  "biometric",
  "sensor",
  "wearable",
  "ecg",
  "eeg",
  "spo2"
];

const DREAM_TERMS = [
  "dream",
  "dreamed",
  "symbol",
  "symbolic",
  "archetype",
  "sync",
  "synchronicity",
  "vision",
  "nightmare"
];

const HIGH_TERMS = [
  "attachment",
  "relationship",
  "trauma",
  "ptsd",
  "self-diagnosis",
  "diagnose me",
  "abandonment",
  "trust break",
  "panic",
  "depression",
  "suicidal"
];

const MEDIUM_TERMS = [
  "preference",
  "prefer",
  "workstyle",
  "workflow",
  "project decision",
  "decision",
  "habit",
  "priority",
  "roadmap"
];

const RESEARCH_ONLY_TERMS = [
  "research only",
  "aggregate only",
  "research aggregate",
  "anonymized cohort"
];

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function normalizeInput(input: ClassifySensitivityInput): string {
  const action = String(input.action ?? "");
  const content = String(input.content ?? "");
  const metadata = input.metadata ? JSON.stringify(input.metadata).toLowerCase() : "";
  return `${action} ${content} ${metadata}`.toLowerCase();
}

function isExplicitResearchOnly(input: ClassifySensitivityInput, text: string): boolean {
  if (input.explicit_research_only === true) {
    return true;
  }

  return includesAny(text, RESEARCH_ONLY_TERMS);
}

export function classifySensitivity(input: ClassifySensitivityInput): ClassifySensitivityResult {
  const text = normalizeInput(input);
  const reasons: SensitivityReasonCode[] = [];

  if (includesAny(text, BIOMETRIC_TERMS)) {
    reasons.push("biometric_terms_detected");
    return { sensitivity_class: "BIOMETRIC", reasons };
  }

  if (includesAny(text, DREAM_TERMS)) {
    reasons.push("dream_symbolic_terms_detected");
    return { sensitivity_class: "DREAM", reasons };
  }

  if (includesAny(text, HIGH_TERMS)) {
    reasons.push("high_sensitivity_terms_detected");
    return { sensitivity_class: "HIGH", reasons };
  }

  if (isExplicitResearchOnly(input, text)) {
    reasons.push("explicit_research_only_requested");
    return { sensitivity_class: "RESEARCH_ONLY", reasons };
  }

  if (includesAny(text, MEDIUM_TERMS)) {
    reasons.push("medium_sensitivity_terms_detected");
    return { sensitivity_class: "MEDIUM", reasons };
  }

  reasons.push("default_low");
  return { sensitivity_class: "LOW", reasons };
}
