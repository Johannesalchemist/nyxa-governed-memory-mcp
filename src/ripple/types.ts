export const CLAIM_STATUSES = [
  "UNKNOWN", "REPORTED", "SUPPORTED", "CORROBORATED", "VERIFIED",
  "CONTESTED", "CONTRADICTED", "RETRACTED", "UNVERIFIABLE"
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CAUSAL_STATUSES = ["CORRELATION", "HYPOTHESIS", "CAUSAL_SUPPORT", "CAUSAL_EVIDENCE"] as const;
export type CausalStatus = (typeof CAUSAL_STATUSES)[number];

export type RippleEvent = {
  id: string;
  occurred_at: string;
  entity_ids: string[];
  observation_ids: string[];
};

export type RippleClaim = {
  id: string;
  statement: string;
  about_event_id?: string;
  source: string;
  asserted_at: string;
  status: ClaimStatus;
  evidence_ids: string[];
};

export type RippleEvidence = {
  id: string;
  observed_at: string;
  provenance_ref: string;
  supports_claim_ids: string[];
  contradicts_claim_ids: string[];
  quality: number;
};

export type RippleNarrative = {
  id: string;
  claim_ids: string[];
  framing: string;
  audience: string[];
  reach?: number;
};

export type RippleState = {
  entity_id: string;
  variable: string;
  value: unknown;
  observed_at: string;
  provenance_ref: string;
};

export type CausalEdge = {
  id: string;
  from: string;
  to: string;
  mechanism: string;
  status: CausalStatus;
  confidence: number;
  evidence_ids: string[];
};

export type ClaimRevision = {
  claim_id: string;
  status: ClaimStatus;
  valid_from: string;
  recorded_at: string;
  provenance_ref: string;
  supersedes?: string;
};

export type ClaimDecision = {
  decision: "ALLOW" | "DENY" | "ESCALATE";
  effective_status: ClaimStatus;
  reasons: string[];
  revision?: ClaimRevision;
};
