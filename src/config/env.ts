import { resolve } from "node:path";
import { isNyxaAgentMode, type NyxaAgentMode } from "../policy/modes.js";
import type { MemoryBackendType } from "../backend/MemoryBackend.js";
import { loadConnectorConfig } from "../connector/config.js";
import type { ConnectorConfig } from "../connector/types.js";
import { resolveToolProfile, type ResolvedToolProfile } from "../policy/toolProfile.js";
import type { EvidenceAttestationClass, EvidencePassportTrustAnchor } from "../identity/unifiedTrustFabric.js";

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return defaultValue;
}

const EVIDENCE_ATTESTATION_CLASSES = new Set<EvidenceAttestationClass>([
  "execution_result",
  "connector_observation",
  "external_evidence",
  "human_observation"
]);

function parseEvidencePassportTrustAnchors(value: string | undefined): readonly EvidencePassportTrustAnchor[] {
  if (!value || value.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("invalid_evidence_passport_trust_anchors_json");
  }
  if (!Array.isArray(parsed) || parsed.length > 32) {
    throw new Error("invalid_evidence_passport_trust_anchors");
  }
  const anchors = parsed.map((entry): EvidencePassportTrustAnchor => {
    if (!entry || typeof entry !== "object") throw new Error("invalid_evidence_passport_trust_anchor");
    const x = entry as Record<string, unknown>;
    if (
      typeof x.issuerId !== "string" || x.issuerId.length < 1 || x.issuerId.length > 200 ||
      typeof x.keyId !== "string" || x.keyId.length < 1 || x.keyId.length > 200 ||
      typeof x.publicKeyPem !== "string" || !x.publicKeyPem.includes("BEGIN PUBLIC KEY") ||
      !Array.isArray(x.allowedClasses) || x.allowedClasses.length < 1 ||
      !x.allowedClasses.every((c) => typeof c === "string" && EVIDENCE_ATTESTATION_CLASSES.has(c as EvidenceAttestationClass)) ||
      !Number.isSafeInteger(x.maxAgeSeconds) || (x.maxAgeSeconds as number) < 1 || (x.maxAgeSeconds as number) > 86400
    ) throw new Error("invalid_evidence_passport_trust_anchor");
    return {
      issuerId: x.issuerId,
      keyId: x.keyId,
      publicKeyPem: x.publicKeyPem,
      allowedClasses: [...new Set(x.allowedClasses as EvidenceAttestationClass[])],
      maxAgeSeconds: x.maxAgeSeconds as number
    };
  });
  const identities = anchors.map((a) => `${a.issuerId}\0${a.keyId}`);
  if (new Set(identities).size !== identities.length) throw new Error("duplicate_evidence_passport_trust_anchor");
  return anchors;
}

function parseMode(value: string | undefined): NyxaAgentMode {
  const fallback: NyxaAgentMode = "observe_only";
  if (!value) {
    return fallback;
  }

  if (!isNyxaAgentMode(value)) {
    throw new Error(`invalid_agent_mode:${value}`);
  }

  if (value === "supervised_execute") {
    throw new Error("supervised_execute_not_allowed_in_v01");
  }

  return value;
}

function parseBackend(value: string | undefined): MemoryBackendType {
  const fallback: MemoryBackendType = "local";
  if (!value) {
    return fallback;
  }

  const normalized = value.trim() as MemoryBackendType;
  const allowed: MemoryBackendType[] = ["local", "remote", "dedicated_node", "customer_owned"];
  if (!allowed.includes(normalized)) {
    throw new Error(`invalid_memory_backend:${value}`);
  }

  return normalized;
}

export type NyxaConfig = {
  appName: "nyxa-governed-memory-mcp";
  version: "0.1.1";
  agentMode: NyxaAgentMode;
  memoryBackend: MemoryBackendType;
  dataDir: string;
  featureFlags: {
    dreamingEnabled: boolean;
    apprenticeEnabled: boolean;
    visualObservationEnabled: boolean;
    draftsEnabled: boolean;
    authoritativeWritesEnabled: boolean;
    executionToolsEnabled: boolean;
  };
  remoteMemory: {
    url: string;
    token: string;
  };
  connector: ConnectorConfig;
  /** Public verification roots only. Private signing keys must live outside this process. */
  evidencePassportTrustAnchors: readonly EvidencePassportTrustAnchor[];
  /** Per-consumer tool discovery/invocation restriction. See policy/toolProfile.ts. Read once
   *  here from NYXA_MCP_TOOL_PROFILE; nothing else in this codebase ever sets or mutates it. */
  toolProfile: ResolvedToolProfile;
  /** Disposable-scratch root for the governance E2E regression test tools
   *  (nyxa_e2e_write_scratch / nyxa_e2e_escalate_scratch — see server.ts). Undefined unless
   *  NYXA_E2E_SCRATCH_ROOT is explicitly set; production never sets it, so those two tools
   *  are inert (fail closed with e2e_scratch_root_not_configured) everywhere except a
   *  deliberately configured isolated test instance. */
  e2eScratchRoot: string | undefined;
  /** Pre-shared out-of-band secret gating nyxa_human_grant_issue (Step 11 human-authority
   *  capability, see governance/humanGrant.ts). Undefined unless NYXA_HUMAN_AUTHORITY_TOKEN is
   *  explicitly set; without it, grant issuance is unconditionally inert (fail-closed), so
   *  nyxa_memory_promote_candidate can never leave ESCALATE in any deployment that doesn't
   *  configure this — same precedent as e2eScratchRoot above. */
  humanAuthorityToken: string | undefined;
};

export function loadConfig(): NyxaConfig {
  const agentMode = parseMode(process.env.NYXA_AGENT_MODE);
  const memoryBackend = parseBackend(process.env.NYXA_MEMORY_BACKEND);
  const dataDir = resolve(process.cwd(), process.env.NYXA_DATA_DIR ?? "./data");

  const featureFlags = {
    dreamingEnabled: parseBoolean(process.env.NYXA_DREAMING_ENABLED, false),
    apprenticeEnabled: parseBoolean(process.env.NYXA_APPRENTICE_ENABLED, true),
    visualObservationEnabled: parseBoolean(process.env.NYXA_VISUAL_OBSERVATION_ENABLED, false),
    draftsEnabled: parseBoolean(process.env.NYXA_DRAFTS_ENABLED, false),
    authoritativeWritesEnabled: parseBoolean(process.env.NYXA_AUTHORITATIVE_WRITES_ENABLED, true),
    executionToolsEnabled: parseBoolean(process.env.NYXA_EXECUTION_TOOLS_ENABLED, true)
  };


  return {
    appName: "nyxa-governed-memory-mcp",
    version: "0.1.1",
    agentMode,
    memoryBackend,
    dataDir,
    featureFlags,
    remoteMemory: {
      url: process.env.NYXA_REMOTE_MEMORY_URL ?? "",
      token: process.env.NYXA_REMOTE_MEMORY_TOKEN ?? ""
    },
    connector: loadConnectorConfig(process.env.NYXA_CONNECTOR_CONFIG),
    evidencePassportTrustAnchors: parseEvidencePassportTrustAnchors(process.env.NYXA_EVIDENCE_PASSPORT_TRUST_ANCHORS_JSON),
    toolProfile: resolveToolProfile(process.env.NYXA_MCP_TOOL_PROFILE),
    e2eScratchRoot: process.env.NYXA_E2E_SCRATCH_ROOT,
    humanAuthorityToken: process.env.NYXA_HUMAN_AUTHORITY_TOKEN
  };
}
