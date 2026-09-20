export type CapabilityClass = "I0" | "I1" | "I2" | "I3";
// "HELD" (Step 11B): unlike gamma's ESCALATE/DEGRADE (deliberately mapped onto existing values
// in server.ts's mapGammaOutcomeToAuditDecision, see its own comment), EPISTEMIC_HOLD has no
// adequate existing value to approximate -- REQUIRES_APPROVAL is an authority question, UNKNOWN
// means an unrecognized tool, and DENIED is explicitly disallowed (Step 11B.3: "Do not mislabel
// it DENY", since gamma DID allow and a human grant may already be valid -- only epistemic
// sufficiency is what's missing). Widened here, once, for exactly this reason.
export type PolicyOutcome = "ALLOWED" | "DENIED" | "REQUIRES_APPROVAL" | "INVALID" | "UNKNOWN" | "HELD";
export type EvidenceStatus = "SUPPORTED" | "UNSUPPORTED" | "CONTRADICTED" | "UNKNOWN";
export type EvidenceTrust = "VERIFIED_SOURCE" | "UNVERIFIED_SOURCE";

export type ConnectorRoot = {
  id: string;
  path: string;
  access: "read" | "dev";
  trust: EvidenceTrust;
  postPatchTarget?: string | undefined;
};

export type ConnectorRepository = { id: string; path: string; rootId: string };
export type ConnectorService = { id: string; kind: "systemd"; unit: string };
export type IntegrityFile = { path: string; sha256: string };

export type ConnectorTestTarget = {
  id: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  trust: EvidenceTrust;
  integrityFiles: IntegrityFile[];
  network: boolean;
  memoryLimitKb: number;
  nprocLimit: number;
  scratchSizeKb: number;
};

export type ConnectorLimits = {
  maxOutputChars: number;
  maxFileBytes: number;
  maxSearchResults: number;
  maxSearchFiles: number;
  maxDirectoryEntries: number;
  maxPatchBytes: number;
  toolTimeoutMs: number;
  rateLimitPerMinute: number;
};

export type ConnectorConfig = {
  enabled: boolean;
  devEnabled: boolean;
  gitExecutable: string;
  systemctlExecutable: string;
  roots: ConnectorRoot[];
  repositories: ConnectorRepository[];
  services: ConnectorService[];
  testTargets: ConnectorTestTarget[];
  limits: ConnectorLimits;
};

export type ConnectorEvidence = {
  claim: string;
  implementation: string;
  status: EvidenceStatus;
  trust: EvidenceTrust;
  observations: string[];
  adversarialTest?: string | undefined;
  gamma: EvidenceStatus;
};

export type ConnectorResult<T extends Record<string, unknown> = Record<string, unknown>> = {
  policy_decision: PolicyOutcome;
  capability_class: CapabilityClass;
  resource_id?: string | undefined;
  evidence: ConnectorEvidence;
  data?: T | undefined;
  truncated: boolean;
  redactions_applied: number;
};
